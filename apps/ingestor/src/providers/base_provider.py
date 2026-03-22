"""Abstract base class for flight data providers."""

from abc import ABC, abstractmethod
from typing import Any


class BaseFlightProvider(ABC):
    """Interface that all flight data providers must implement.

    To add a new provider (e.g. FlightAware, ADS-B Exchange):
      1. Create a new file in providers/
      2. Subclass BaseFlightProvider
      3. Implement fetch_arrivals() and fetch_departures()
      4. Register it in the worker config
    """

    @abstractmethod
    async def fetch_arrivals(self, airport_iata: str) -> list[dict[str, Any]]:
        """Fetch arriving flights for the given airport.

        Returns raw API response data as a list of dicts.
        Each dict represents one flight in the provider's native format.
        """

    @abstractmethod
    async def fetch_departures(self, airport_iata: str) -> list[dict[str, Any]]:
        """Fetch departing flights for the given airport.

        Returns raw API response data as a list of dicts.
        """

    @abstractmethod
    def normalize(self, raw: dict[str, Any], direction: str) -> dict[str, Any]:
        """Normalize a single raw flight record into the canonical schema.

        Args:
            raw: Raw flight data from the provider's API.
            direction: 'arrival' or 'departure'.

        Returns:
            Dict matching the flights_current table schema.
        """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name for logging."""
