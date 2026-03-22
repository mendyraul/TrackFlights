"""AviationStack API provider implementation."""

from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from src.providers.base_provider import BaseFlightProvider
from src.config import settings

logger = structlog.get_logger()

# Maps AviationStack status strings to our flight_status enum
STATUS_MAP = {
    "scheduled": "scheduled",
    "active": "en_route",
    "en-route": "en_route",
    "landed": "landed",
    "arrived": "arrived",
    "departed": "departed",
    "cancelled": "cancelled",
    "diverted": "diverted",
    "delayed": "delayed",
    "incident": "unknown",
}


class AviationStackProvider(BaseFlightProvider):
    """Flight data from aviationstack.com API."""

    def __init__(self) -> None:
        self.base_url = settings.flight_api_base_url
        self.api_key = settings.flight_api_key

    @property
    def name(self) -> str:
        return "aviationstack"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def _fetch(self, params: dict[str, Any]) -> list[dict[str, Any]]:
        """Execute an API request with retry logic."""
        params["access_key"] = self.api_key
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(f"{self.base_url}/flights", params=params)
            resp.raise_for_status()
            data = resp.json()

        if "error" in data:
            logger.error("API error", error=data["error"])
            return []

        return data.get("data", [])

    async def fetch_arrivals(self, airport_iata: str) -> list[dict[str, Any]]:
        logger.debug("Fetching arrivals", airport=airport_iata)
        return await self._fetch({"arr_iata": airport_iata, "limit": 100})

    async def fetch_departures(self, airport_iata: str) -> list[dict[str, Any]]:
        logger.debug("Fetching departures", airport=airport_iata)
        return await self._fetch({"dep_iata": airport_iata, "limit": 100})

    def normalize(self, raw: dict[str, Any], direction: str) -> dict[str, Any]:
        """Transform AviationStack response into canonical flight record."""
        flight = raw.get("flight", {})
        airline = raw.get("airline", {})
        dep = raw.get("departure", {})
        arr = raw.get("arrival", {})
        aircraft = raw.get("aircraft", {})
        live = raw.get("live", {}) or {}

        flight_iata = flight.get("iata") or ""
        if not flight_iata:
            flight_iata = f"{airline.get('iata', 'XX')}{flight.get('number', '0')}"

        return {
            "flight_iata": flight_iata,
            "flight_icao": flight.get("icao"),
            "flight_number": flight.get("number"),
            "airline_iata": airline.get("iata"),
            "airline_name": airline.get("name"),
            "aircraft_icao": aircraft.get("icao"),
            "aircraft_registration": aircraft.get("registration"),
            "direction": direction,
            "origin_iata": dep.get("iata"),
            "origin_name": dep.get("airport"),
            "destination_iata": arr.get("iata"),
            "destination_name": arr.get("airport"),
            "scheduled_departure": dep.get("scheduled"),
            "actual_departure": dep.get("actual"),
            "scheduled_arrival": arr.get("scheduled"),
            "actual_arrival": arr.get("actual"),
            "estimated_arrival": arr.get("estimated"),
            "status": STATUS_MAP.get(
                raw.get("flight_status", "unknown").lower(), "unknown"
            ),
            "delay_minutes": dep.get("delay") or arr.get("delay") or 0,
            "latitude": live.get("latitude"),
            "longitude": live.get("longitude"),
            "altitude_ft": _to_int(live.get("altitude")),
            "heading": live.get("direction"),
            "ground_speed_knots": _to_int(live.get("speed_horizontal")),
            "vertical_speed_fpm": _to_int(live.get("speed_vertical")),
            "departure_terminal": dep.get("terminal"),
            "departure_gate": dep.get("gate"),
            "arrival_terminal": arr.get("terminal"),
            "arrival_gate": arr.get("gate"),
            "baggage_belt": arr.get("baggage"),
            "data_source": self.name,
        }


def _to_int(val: Any) -> int | None:
    """Safely cast to int or return None."""
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None
