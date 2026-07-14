"""ADS-B 1090 MHz provider — reads a local readsb/dump1090 `aircraft.json` feed.

This provider turns a self-hosted ground station (RTL-SDR + antenna on a
Raspberry Pi running readsb/dump1090-fa) into a flight data source. Instead of
calling an external API, it reads the decoder's `aircraft.json` over local HTTP,
filters to aircraft within range of MIA, and normalizes each into the canonical
`flights_current` schema.

Notes:
  * ADS-B is a *position feed*, not an arrival/departure board, so this is a
    "live position" provider (``is_live_position_feed = True``) and the poller
    fetches one snapshot per cycle.
  * The Pi -> Supabase write is ingress and does not count against the Supabase
    egress budget; in-provider range + movement gating keeps row churn (and the
    DB footprint) bounded. See docs/etl-pipeline.md.
"""

from math import asin, cos, radians, sin, sqrt
from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import settings
from src.providers.base_provider import BaseFlightProvider
from src.services.flight_normalizer import icao_callsign_to_iata

logger = structlog.get_logger()

# KMIA (Miami International) reference position.
MIA_LAT = 25.79325
MIA_LON = -80.29056

_EARTH_RADIUS_M = 6_371_000.0


def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points in meters."""
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * _EARTH_RADIUS_M * asin(sqrt(a))


def _to_int(val: Any) -> int | None:
    """Safely cast to int or return None ('ground' and junk map to None)."""
    if val is None or isinstance(val, str):
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


class Adsb1090Provider(BaseFlightProvider):
    """Live aircraft positions decoded locally from 1090 MHz ADS-B."""

    def __init__(self) -> None:
        self.json_url = settings.adsb_json_url
        self.max_range_km = settings.adsb_max_range_km
        self.min_move_meters = settings.adsb_min_move_meters
        self.max_seen_seconds = settings.adsb_max_seen_seconds
        # icao24 -> (lat, lon) of the last position we emitted, for movement gating.
        self._last_emitted: dict[str, tuple[float, float]] = {}

    @property
    def name(self) -> str:
        return "adsb1090"

    @property
    def is_live_position_feed(self) -> bool:
        return True

    # Abstract board methods are unused for a position feed but must exist.
    async def fetch_arrivals(self, airport_iata: str) -> list[dict[str, Any]]:
        return []

    async def fetch_departures(self, airport_iata: str) -> list[dict[str, Any]]:
        return []

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    async def _read_feed(self) -> list[dict[str, Any]]:
        """Read the decoder's aircraft.json over local HTTP."""
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(self.json_url)
            resp.raise_for_status()
            data = resp.json()
        return data.get("aircraft", []) or []

    async def fetch_live_positions(self, airport_iata: str) -> list[dict[str, Any]]:
        """Return in-range, fresh, moving aircraft from the local feed.

        Filtering keeps Supabase writes and DB rows bounded:
          1. drop aircraft without a position fix,
          2. drop stale tracks (``seen`` older than max_seen_seconds),
          3. drop aircraft beyond max_range_km of MIA,
          4. drop aircraft that have not moved >= min_move_meters since last emit.
        """
        raw_aircraft = await self._read_feed()

        kept: list[dict[str, Any]] = []
        active_hexes: set[str] = set()
        max_range_m = self.max_range_km * 1000.0

        for ac in raw_aircraft:
            hex_id = ac.get("hex")
            lat = ac.get("lat")
            lon = ac.get("lon")
            if not hex_id or lat is None or lon is None:
                continue

            seen = ac.get("seen_pos", ac.get("seen"))
            if seen is not None and seen > self.max_seen_seconds:
                continue

            distance_m = _haversine_meters(MIA_LAT, MIA_LON, lat, lon)
            if distance_m > max_range_m:
                continue

            active_hexes.add(hex_id)
            last = self._last_emitted.get(hex_id)
            if last is not None:
                moved = _haversine_meters(last[0], last[1], lat, lon)
                if moved < self.min_move_meters:
                    continue

            self._last_emitted[hex_id] = (lat, lon)
            kept.append(ac)

        # Forget aircraft no longer in range so the cache cannot grow unbounded.
        for stale_hex in set(self._last_emitted) - active_hexes:
            self._last_emitted.pop(stale_hex, None)

        logger.info(
            "ADS-B snapshot",
            received=len(raw_aircraft),
            in_range_active=len(active_hexes),
            emitted=len(kept),
        )
        return kept

    def normalize(self, raw: dict[str, Any], direction: str) -> dict[str, Any]:
        """Transform one readsb aircraft record into a canonical flight row.

        ``direction`` is ignored; it is inferred per-aircraft from vertical rate
        since ADS-B carries no arrival/departure board semantics.
        """
        hex_id = str(raw.get("hex", "")).strip().lstrip("~").upper()
        callsign = (raw.get("flight") or "").strip()
        # Convert ICAO callsigns to IATA idents so ADS-B contacts land on the
        # same flights_current row as schedule-feed data (AeroAPI et al).
        flight_iata = icao_callsign_to_iata(callsign) if callsign else hex_id

        alt_baro = raw.get("alt_baro")
        on_ground = alt_baro == "ground"
        vertical_rate = raw.get("baro_rate", raw.get("geom_rate"))

        if on_ground:
            status = "landed"
            inferred_direction = "arrival"
        else:
            status = "en_route"
            # Descending => arriving, otherwise treat as departing/overflying.
            inferred_direction = (
                "arrival"
                if isinstance(vertical_rate, (int, float)) and vertical_rate < -64
                else "departure"
            )

        return {
            "flight_iata": flight_iata,
            "flight_icao": callsign or None,
            "flight_number": callsign or None,
            "aircraft_icao": raw.get("t"),
            "aircraft_registration": raw.get("r"),
            "direction": inferred_direction,
            "status": status,
            "latitude": raw.get("lat"),
            "longitude": raw.get("lon"),
            "altitude_ft": 0 if on_ground else _to_int(alt_baro),
            "heading": raw.get("track"),
            "ground_speed_knots": _to_int(raw.get("gs")),
            "vertical_speed_fpm": _to_int(vertical_rate),
            "data_source": self.name,
            "raw_data": {"hex": hex_id, "category": raw.get("category")},
        }
