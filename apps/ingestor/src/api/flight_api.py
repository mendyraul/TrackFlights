"""Flight API client — abstracts the external flight data provider."""

from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import settings

logger = structlog.get_logger()


class FlightAPIClient:
    """Client for fetching flight data from external APIs.

    Currently configured for AviationStack. Swap the implementation
    for FlightAware, ADS-B Exchange, or other providers.
    """

    def __init__(self) -> None:
        self.base_url = settings.flight_api_base_url
        self.api_key = settings.flight_api_key

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=30))
    async def fetch_flights(self, direction: str) -> list[dict[str, Any]]:
        """Fetch flights for MIA from the API.

        Args:
            direction: 'arrival' or 'departure'
        """
        endpoint = "flights"
        params: dict[str, Any] = {
            "access_key": self.api_key,
            "limit": 100,
        }

        if direction == "arrival":
            params["arr_iata"] = settings.mia_iata_code
        else:
            params["dep_iata"] = settings.mia_iata_code

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{self.base_url}/{endpoint}",
                params=params,
            )
            response.raise_for_status()
            data = response.json()

        flights = data.get("data", [])
        logger.debug(
            "API response",
            direction=direction,
            count=len(flights),
        )
        return flights
