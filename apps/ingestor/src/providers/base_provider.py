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

    # ------------------------------------------------------------------
    # Live position feeds (e.g. ADS-B) — optional capability
    # ------------------------------------------------------------------
    @property
    def is_live_position_feed(self) -> bool:
        """Whether this provider emits a single live snapshot of in-range aircraft.

        Schedule providers (AviationStack) return arrival/departure boards and
        leave this False. Position feeds (ADS-B/readsb) override it to True so
        the poller fetches one snapshot instead of two board queries.
        """
        return False

    async def fetch_live_positions(self, airport_iata: str) -> list[dict[str, Any]]:
        """Fetch all in-range aircraft as a single snapshot.

        Default implementation combines arrivals + departures so existing
        providers keep working; live-feed providers override it.
        """
        arrivals = await self.fetch_arrivals(airport_iata)
        departures = await self.fetch_departures(airport_iata)
        return arrivals + departures
