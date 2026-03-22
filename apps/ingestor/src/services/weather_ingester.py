"""Weather ingestion service — fetches and stores weather data."""

from typing import Any

import structlog
from supabase import Client

from src.providers.weather.base_weather_provider import BaseWeatherProvider

logger = structlog.get_logger()

# MIA coordinates
MIA_LAT = 25.7959
MIA_LON = -80.2870


class WeatherIngester:
    """Fetches weather from a provider and upserts to weather_snapshots."""

    def __init__(self, provider: BaseWeatherProvider, db: Client) -> None:
        self.provider = provider
        self.db = db

    async def ingest_current(self) -> dict[str, Any]:
        """Fetch current weather and store snapshot."""
        raw = await self.provider.fetch_current(MIA_LAT, MIA_LON)
        normalized = self.provider.normalize(raw)

        self.db.table("weather_snapshots").upsert(
            normalized,
            on_conflict="airport_iata,observed_at",
        ).execute()

        logger.info(
            "Weather snapshot stored",
            temp=normalized.get("temperature_c"),
            wind=normalized.get("wind_speed_knots"),
            weather=normalized.get("weather_description"),
            thunderstorm=normalized.get("is_thunderstorm"),
        )

        return normalized

    async def ingest_forecast(self, hours: int = 12) -> int:
        """Fetch hourly forecast and store snapshots."""
        raw_hours = await self.provider.fetch_forecast(MIA_LAT, MIA_LON, hours)

        snapshots = []
        for hour_data in raw_hours:
            snapshots.append(
                self.provider.normalize_forecast_hour(hour_data)  # type: ignore[attr-defined]
            )

        if snapshots:
            self.db.table("weather_snapshots").upsert(
                snapshots,
                on_conflict="airport_iata,observed_at",
            ).execute()

        logger.info("Weather forecast stored", hours=len(snapshots))
        return len(snapshots)

    def get_latest(self) -> dict[str, Any] | None:
        """Get the most recent weather snapshot."""
        result = (
            self.db.table("weather_snapshots")
            .select("*")
            .eq("airport_iata", "MIA")
            .order("observed_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def get_recent(self, hours: int = 12) -> list[dict[str, Any]]:
        """Get recent weather snapshots for trend analysis."""
        from datetime import datetime, timedelta, timezone

        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

        result = (
            self.db.table("weather_snapshots")
            .select("*")
            .eq("airport_iata", "MIA")
            .gte("observed_at", cutoff)
            .order("observed_at", desc=False)
            .execute()
        )
        return result.data or []
