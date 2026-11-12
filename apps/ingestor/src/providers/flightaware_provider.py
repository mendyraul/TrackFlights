"""FlightAware airport boards with persisted six-hour windows and a shared budget.

The regional snapshot service shares this provider's accounting ledger. Endpoint
prices are configurable and reservations precede every paid HTTP attempt.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog

from src.config import settings
from src.providers.base_provider import BaseFlightProvider
from src.services.aeroapi_budget import AeroApiBudget
from src.services.aeroapi_pacer import pacer

logger = structlog.get_logger()

# Overlap between consecutive watermark windows so boundary flights aren't missed.
WATERMARK_OVERLAP = timedelta(minutes=15)


class FlightAwareProvider(BaseFlightProvider):
    """Flight data from FlightAware AeroAPI airport boards."""

    def __init__(self) -> None:
        self.base_url = settings.flight_api_base_url.rstrip("/")
        self.api_key = settings.flight_api_key
        self.max_pages = settings.aeroapi_max_pages
        self.budget = AeroApiBudget(
            state_path=settings.aeroapi_budget_state_path,
            monthly_budget_usd=settings.aeroapi_monthly_budget_usd,
            cost_per_query_usd=settings.aeroapi_cost_per_query_usd,
        )
        # Per-board start of the next fetch window.
        self._watermarks: dict[str, datetime] = {}
        # UTC date the scheduled_* boards were last fetched.
        self._last_scheduled_date: str | None = None

    @property
    def name(self) -> str:
        return "flightaware"

    async def _request_board(
        self, airport_code: str, board: str, params: dict[str, Any]
    ) -> list[dict[str, Any]]:
        url = f"{self.base_url}/airports/{airport_code}/flights/{board}"
        headers = {"x-apikey": self.api_key, "Accept": "application/json"}

        await pacer.wait(int(params.get("max_pages", 1)))
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url, headers=headers, params=params)
            resp.raise_for_status()
            payload = resp.json()

        return self._extract_board(payload, board)

    async def _fetch_board(
        self,
        airport_code: str,
        board: str,
        start: datetime | None = None,
        end: datetime | None = None,
    ) -> list[dict[str, Any]]:
        """Fetch one airport board, spending from the monthly budget."""
        window = datetime.now(UTC).strftime("%Y-%m-%d") + f":{datetime.now(UTC).hour // 6}:{board}"
        if not self.budget.reserve(1, settings.aeroapi_board_cost_per_page_usd, window):
            return []

        params: dict[str, Any] = {"max_pages": 1}
        if start is not None:
            params["start"] = start.strftime("%Y-%m-%dT%H:%M:%SZ")
        if end is not None:
            params["end"] = end.strftime("%Y-%m-%dT%H:%M:%SZ")

        flights = await self._request_board(airport_code, board, params)
        if hasattr(self, "schedule_client"):
            normalized = [
                self.normalize(raw, "arrival" if "arrivals" in board else "departure")
                for raw in flights
            ]
            for index, record in enumerate(normalized):
                record["id"] = flights[index].get("fa_flight_id") or f"{board}:{index}:{window}"
                for field in (
                    "latitude",
                    "longitude",
                    "altitude_ft",
                    "heading",
                    "ground_speed_knots",
                    "vertical_speed_fpm",
                ):
                    record.pop(field, None)
            self.schedule_client.table("airport_schedule_snapshots").upsert(
                {
                    "airport": airport_code,
                    "board": board,
                    "fetched_at": datetime.now(UTC).isoformat(),
                    "flights": normalized,
                },
                on_conflict="airport,board",
            ).execute()
        logger.info(
            "AeroAPI board fetched",
            board=board,
            flights=len(flights),
            **self.budget.snapshot(),
        )
        return flights

    def _board_window(self, board: str) -> tuple[datetime, datetime]:
        """Watermark window for a completed-flights board: last poll -> now."""
        now = datetime.now(UTC)
        default_lookback = timedelta(hours=6)
        start = now - default_lookback - WATERMARK_OVERLAP
        self._watermarks[board] = now - WATERMARK_OVERLAP
        return start, now

    def _scheduled_boards_due(self) -> bool:
        return True

    async def fetch_arrivals(self, airport_iata: str) -> list[dict[str, Any]]:
        start, end = self._board_window("arrivals")
        flights = await self._fetch_board(airport_iata, "arrivals", start, end)
        if self._scheduled_boards_due():
            flights += await self._fetch_board(airport_iata, "scheduled_arrivals")
        return flights

    async def fetch_departures(self, airport_iata: str) -> list[dict[str, Any]]:
        start, end = self._board_window("departures")
        flights = await self._fetch_board(airport_iata, "departures", start, end)
        if self._scheduled_boards_due():
            flights += await self._fetch_board(airport_iata, "scheduled_departures")
            self._last_scheduled_date = datetime.now(UTC).strftime("%Y-%m-%d")
        return flights

    def normalize(self, raw: dict[str, Any], direction: str) -> dict[str, Any]:
        """Transform FlightAware board data into the canonical flight record."""
        origin = raw.get("origin") or {}
        destination = raw.get("destination") or {}
        position = raw.get("last_position") or {}

        flight_iata = _first_truthy(raw, "ident_iata", "ident") or raw.get("fa_flight_id") or ""
        airline_iata = _first_truthy(raw, "operator_iata", "airline_iata")
        flight_number = raw.get("flight_number") or _extract_flight_number(flight_iata)

        record = {
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
            "altitude_ft": (
                int(position["altitude"]) * 100
                if position.get("altitude") is not None
                else _to_int(position.get("altitude_ft"))
            ),
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

        return record

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
        logger.warning(
            "FlightAware response missing board list", board=board, keys=list(payload.keys())
        )
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
    if raw.get("cancelled") is True:
        return "cancelled"
    if raw.get("diverted") is True:
        return "diverted"

    status = str(
        _first_truthy(raw, "status", "flight_status", "status_text", "status_description")
        or "unknown"
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
    # AeroAPI's arrival_delay/departure_delay are SECONDS (negative = early).
    explicit_seconds = _to_int(_first_truthy(raw, "arrival_delay", "departure_delay"))
    if explicit_seconds is not None:
        return max(explicit_seconds // 60, 0)

    explicit_minutes = _to_int(raw.get("delay_minutes"))
    if explicit_minutes is not None:
        return max(explicit_minutes, 0)

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
