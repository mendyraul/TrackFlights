"""Open-Meteo weather provider — free, no API key required.

API docs: https://open-meteo.com/en/docs
"""

from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from src.providers.weather.base_weather_provider import BaseWeatherProvider

logger = structlog.get_logger()

BASE_URL = "https://api.open-meteo.com/v1/forecast"

# WMO weather interpretation codes
# https://open-meteo.com/en/docs#weathervariables
WMO_DESCRIPTIONS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}

THUNDERSTORM_CODES = {95, 96, 99}
FOG_CODES = {45, 48}


class OpenMeteoProvider(BaseWeatherProvider):
    """Weather data from Open-Meteo (free, no API key)."""

    @property
    def name(self) -> str:
        return "openmeteo"

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=15))
    async def fetch_current(self, lat: float, lon: float) -> dict[str, Any]:
        """Fetch current weather for the given coordinates."""
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": ",".join([
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "precipitation",
                "weather_code",
                "cloud_cover",
                "pressure_msl",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m",
            ]),
            "wind_speed_unit": "kn",
            "timezone": "UTC",
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(BASE_URL, params=params)
            resp.raise_for_status()
            return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=15))
    async def fetch_forecast(
        self, lat: float, lon: float, hours: int = 12
    ) -> list[dict[str, Any]]:
        """Fetch hourly forecast."""
        params = {
            "latitude": lat,
            "longitude": lon,
            "hourly": ",".join([
                "temperature_2m",
                "apparent_temperature",
                "relative_humidity_2m",
                "precipitation_probability",
                "precipitation",
                "weather_code",
                "cloud_cover",
                "visibility",
                "wind_speed_10m",
                "wind_direction_10m",
                "wind_gusts_10m",
                "pressure_msl",
            ]),
            "wind_speed_unit": "kn",
            "timezone": "UTC",
            "forecast_hours": hours,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(BASE_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        hourly = data.get("hourly", {})
        times = hourly.get("time", [])
        snapshots = []

        for i, time_str in enumerate(times[:hours]):
            snapshots.append({
                "time": time_str,
                "temperature_2m": hourly.get("temperature_2m", [None])[i],
                "apparent_temperature": hourly.get("apparent_temperature", [None])[i],
                "relative_humidity_2m": hourly.get("relative_humidity_2m", [None])[i],
                "precipitation_probability": hourly.get("precipitation_probability", [None])[i],
                "precipitation": hourly.get("precipitation", [None])[i],
                "weather_code": hourly.get("weather_code", [None])[i],
                "cloud_cover": hourly.get("cloud_cover", [None])[i],
                "visibility": hourly.get("visibility", [None])[i],
                "wind_speed_10m": hourly.get("wind_speed_10m", [None])[i],
                "wind_direction_10m": hourly.get("wind_direction_10m", [None])[i],
                "wind_gusts_10m": hourly.get("wind_gusts_10m", [None])[i],
                "pressure_msl": hourly.get("pressure_msl", [None])[i],
            })

        return snapshots

    def normalize(self, raw: dict[str, Any]) -> dict[str, Any]:
        """Normalize Open-Meteo current weather into canonical schema."""
        current = raw.get("current", {})
        weather_code = current.get("weather_code", 0)

        return {
            "airport_iata": "MIA",
            "observed_at": current.get("time", datetime.now(timezone.utc).isoformat()),
            "temperature_c": current.get("temperature_2m"),
            "feels_like_c": current.get("apparent_temperature"),
            "wind_speed_knots": current.get("wind_speed_10m"),
            "wind_direction_deg": current.get("wind_direction_10m"),
            "wind_gust_knots": current.get("wind_gusts_10m"),
            "visibility_km": None,  # Not in current endpoint
            "precipitation_mm": current.get("precipitation"),
            "precipitation_probability": None,  # Only in forecast
            "humidity_pct": current.get("relative_humidity_2m"),
            "cloud_coverage_pct": current.get("cloud_cover"),
            "weather_code": weather_code,
            "weather_description": WMO_DESCRIPTIONS.get(weather_code, "Unknown"),
            "is_thunderstorm": weather_code in THUNDERSTORM_CODES,
            "is_fog": weather_code in FOG_CODES,
            "is_freezing": (current.get("temperature_2m") or 99) <= 0,
            "pressure_hpa": current.get("pressure_msl"),
            "data_source": self.name,
        }

    def normalize_forecast_hour(self, hour_data: dict[str, Any]) -> dict[str, Any]:
        """Normalize a single forecast hour into canonical schema."""
        weather_code = hour_data.get("weather_code", 0)
        visibility_m = hour_data.get("visibility")

        return {
            "airport_iata": "MIA",
            "observed_at": hour_data.get("time"),
            "temperature_c": hour_data.get("temperature_2m"),
            "feels_like_c": hour_data.get("apparent_temperature"),
            "wind_speed_knots": hour_data.get("wind_speed_10m"),
            "wind_direction_deg": hour_data.get("wind_direction_10m"),
            "wind_gust_knots": hour_data.get("wind_gusts_10m"),
            "visibility_km": visibility_m / 1000 if visibility_m else None,
            "precipitation_mm": hour_data.get("precipitation"),
            "precipitation_probability": (
                hour_data.get("precipitation_probability", 0) / 100
                if hour_data.get("precipitation_probability") is not None
                else None
            ),
            "humidity_pct": hour_data.get("relative_humidity_2m"),
            "cloud_coverage_pct": hour_data.get("cloud_cover"),
            "weather_code": weather_code,
            "weather_description": WMO_DESCRIPTIONS.get(weather_code, "Unknown"),
            "is_thunderstorm": weather_code in THUNDERSTORM_CODES,
            "is_fog": weather_code in FOG_CODES,
            "is_freezing": (hour_data.get("temperature_2m") or 99) <= 0,
            "pressure_hpa": hour_data.get("pressure_msl"),
            "data_source": "openmeteo",
        }
