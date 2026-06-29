"""FlightAware AeroAPI provider implementation."""

from datetime import UTC, datetime
from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import settings
from src.providers.base_provider import BaseFlightProvider

logger = structlog.get_logger()


class FlightAwareProvider(BaseFlightProvider):
    """Flight data from FlightAware AeroAPI airport boards."""

    def __init__(self) -> None:
        self.base_url = settings.flight_api_base_url.rstrip("/")
        self.api_key = settings.flight_api_key

    @property
    def name(self) -> str:
        return "flightaware"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _fetch_board(self, airport_code: str, board: str) -> list[dict[str, Any]]:
        """Fetch one airport board from AeroAPI."""
        url = f"{self.base_url}/airports/{airport_code}/flights/{board}"
        headers = {"x-apikey": self.api_key, "Accept": "application/json"}
        params = {"max_pages": 1}

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            payload = resp.json()

        return self._extract_board(payload, board)

    async def fetch_arrivals(self, airport_iata: str) -> list[dict[str, Any]]:
        logger.debug("Fetching FlightAware arrivals", airport=airport_iata)
        return await self._fetch_board(airport_iata, "arrivals")

    async def fetch_departures(self, airport_iata: str) -> list[dict[str, Any]]:
        logger.debug("Fetching FlightAware departures", airport=airport_iata)
        return await self._fetch_board(airport_iata, "departures")

    def normalize(self, raw: dict[str, Any], direction: str) -> dict[str, Any]:
        """Transform FlightAware board data into the canonical flight record."""
        origin = raw.get("origin") or {}
        destination = raw.get("destination") or {}
        position = raw.get("last_position") or {}

        flight_iata = _first_truthy(raw, "ident_iata", "ident") or raw.get("fa_flight_id") or ""
        airline_iata = _first_truthy(raw, "operator_iata", "airline_iata")
        flight_number = raw.get("flight_number") or _extract_flight_number(flight_iata)

        return {
            "flight_iata": flight_iata,
            "flight_icao": _first_truthy(raw, "ident_icao", "ident"),
            "flight_number": flight_number,
            "airline_iata": airline_iata,
            "airline_name": _first_truthy(raw, "operator", "airline_name"),
            "aircraft_icao": _first_truthy(raw, "aircraft_type", "aircraft_icao"),
            "aircraft_registration": raw.get("registration"),
            "direction": direction,
            "origin_iata": _airport_code(origin),
            "origin_name": _airport_name(origin),
            "destination_iata": _airport_code(destination),
            "destination_name": _airport_name(destination),
            "scheduled_departure": _first_truthy(
                raw,
                "scheduled_out",
                "scheduled_off",
                "scheduled_departure",
            ),
            "actual_departure": _first_truthy(
                raw,
                "actual_out",
                "actual_off",
                "actual_departure",
            ),
            "scheduled_arrival": _first_truthy(
                raw,
                "scheduled_in",
                "scheduled_on",
                "scheduled_arrival",
            ),
            "actual_arrival": _first_truthy(raw, "actual_in", "actual_on", "actual_arrival"),
            "estimated_arrival": _first_truthy(
                raw,
                "estimated_in",
                "estimated_on",
                "estimated_arrival",
            ),
            "status": _map_status(raw),
            "delay_minutes": _delay_minutes(raw),
            "latitude": _first_truthy(position, "latitude", "lat"),
            "longitude": _first_truthy(position, "longitude", "lon"),
            "altitude_ft": _to_int(_first_truthy(position, "altitude", "altitude_ft")),
            "heading": _to_float(_first_truthy(position, "heading", "track")),
            "ground_speed_knots": _to_int(
                _first_truthy(position, "groundspeed", "ground_speed", "ground_speed_knots")
            ),
            "vertical_speed_fpm": _to_int(
                _first_truthy(position, "vertical_speed", "vertical_speed_fpm")
            ),
            "departure_terminal": _first_truthy(raw, "terminal_origin", "departure_terminal"),
            "departure_gate": _first_truthy(raw, "gate_origin", "departure_gate"),
            "arrival_terminal": _first_truthy(raw, "terminal_destination", "arrival_terminal"),
            "arrival_gate": _first_truthy(raw, "gate_destination", "arrival_gate"),
            "baggage_belt": _first_truthy(raw, "baggage_claim", "baggage_belt"),
            "data_source": self.name,
        }

    @staticmethod
    def _extract_board(payload: dict[str, Any], board: str) -> list[dict[str, Any]]:
        """Handle the small response-shape differences seen across AeroAPI docs/examples."""
        candidate_keys = [
            board,
            f"scheduled_{board}",
            "flights",
        ]
        for key in candidate_keys:
            value = payload.get(key)
            if isinstance(value, list):
                return value
        logger.warning("FlightAware response missing board list", board=board, keys=list(payload.keys()))
        return []


def _first_truthy(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def _airport_code(airport: dict[str, Any]) -> str | None:
    return _first_truthy(airport, "code_iata", "iata_code", "iata", "code")


def _airport_name(airport: dict[str, Any]) -> str | None:
    return _first_truthy(airport, "name", "airport", "city")


def _extract_flight_number(flight_ident: str | None) -> str | None:
    if not flight_ident:
        return None
    digits = "".join(ch for ch in flight_ident if ch.isdigit())
    return digits or None


def _map_status(raw: dict[str, Any]) -> str:
    status = str(
        _first_truthy(raw, "status", "flight_status", "status_text", "status_description") or "unknown"
    ).lower()

    if any(token in status for token in ("cancel", "canceled", "cancelled")):
        return "cancelled"
    if "divert" in status:
        return "diverted"
    if any(token in status for token in ("landed", "arrived", "on gate")):
        return "landed"
    if any(token in status for token in ("departed", "en route", "airborne", "active")):
        return "en_route"
    if "delay" in status:
        return "delayed"
    if any(token in status for token in ("scheduled", "filed")):
        return "scheduled"
    return "unknown"


def _delay_minutes(raw: dict[str, Any]) -> int:
    explicit = _first_truthy(raw, "arrival_delay", "departure_delay", "delay_minutes")
    numeric = _to_int(explicit)
    if numeric is not None:
        return numeric

    scheduled = _first_truthy(raw, "scheduled_in", "scheduled_on", "scheduled_arrival")
    estimated = _first_truthy(raw, "estimated_in", "estimated_on", "actual_in", "actual_on")
    return _minutes_delta(scheduled, estimated) or 0


def _minutes_delta(start: Any, end: Any) -> int | None:
    start_dt = _parse_timestamp(start)
    end_dt = _parse_timestamp(end)
    if start_dt is None or end_dt is None:
        return None
    delta = int((end_dt - start_dt).total_seconds() / 60)
    return max(delta, 0)


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
