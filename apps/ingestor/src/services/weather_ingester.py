"""Weather ingestion service — fetches and stores weather data."""

from datetime import UTC
from typing import Any

import structlog
from supabase import Client

from src.providers.weather.base_weather_provider import BaseWeatherProvider

logger = structlog.get_logger()

MIA_LAT = 25.7959
MIA_LON = -80.2870
# Must match supabase/migrations/00002 (weather_snapshots) — an unknown column
# makes PostgREST 400 the read and kills every poll cycle after the first
# weather interval elapses.
WEATHER_COLUMNS = (
    "airport_iata,observed_at,temperature_c,feels_like_c,humidity_pct,pressure_hpa,"
    "wind_speed_knots,wind_gust_knots,wind_direction_deg,visibility_km,"
    "cloud_coverage_pct,weather_code,weather_description,is_thunderstorm,is_fog,"
    "is_freezing,precipitation_mm,precipitation_probability"
)


class WeatherIngester:
    """Fetches weather from a provider and upserts to weather_snapshots."""

    def __init__(self, provider: BaseWeatherProvider, db: Client) -> None:
        self.provider = provider
        self.db = db

    async def ingest_current(self) -> dict[str, Any]:
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
        raw_hours = await self.provider.fetch_forecast(MIA_LAT, MIA_LON, hours)

        snapshots = [
            self.provider.normalize_forecast_hour(hour_data)  # type: ignore[attr-defined]
            for hour_data in raw_hours
        ]

        if snapshots:
            self.db.table("weather_snapshots").upsert(
                snapshots,
                on_conflict="airport_iata,observed_at",
            ).execute()

        logger.info("Weather forecast stored", hours=len(snapshots))
        return len(snapshots)

    def get_latest(self) -> dict[str, Any] | None:
        result = (
            self.db.table("weather_snapshots")
            .select(WEATHER_COLUMNS)
            .eq("airport_iata", "MIA")
            .order("observed_at", desc=True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    def get_recent(self, hours: int = 12) -> list[dict[str, Any]]:
        from datetime import datetime, timedelta

        cutoff = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()

        result = (
            self.db.table("weather_snapshots")
            .select(WEATHER_COLUMNS)
            .eq("airport_iata", "MIA")
            .gte("observed_at", cutoff)
            .order("observed_at", desc=False)
            .limit(max(12, hours + 6))
            .execute()
        )
        return result.data or []
