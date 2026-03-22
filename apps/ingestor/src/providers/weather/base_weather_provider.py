"""Abstract base class for weather data providers."""

from abc import ABC, abstractmethod
from typing import Any


class BaseWeatherProvider(ABC):
    """Interface for weather data sources.

    To add a new weather provider:
      1. Subclass BaseWeatherProvider
      2. Implement fetch_current() and normalize()
      3. Register in config
    """

    @abstractmethod
    async def fetch_current(self, lat: float, lon: float) -> dict[str, Any]:
        """Fetch current weather conditions for given coordinates.

        Returns raw API response data.
        """

    @abstractmethod
    async def fetch_forecast(
        self, lat: float, lon: float, hours: int = 12
    ) -> list[dict[str, Any]]:
        """Fetch hourly forecast for the next N hours.

        Returns list of hourly snapshots in raw format.
        """

    @abstractmethod
    def normalize(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Normalize raw weather data into canonical schema.

        Returns dict matching the weather_snapshots table.
        """

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name for logging and data_source column."""
