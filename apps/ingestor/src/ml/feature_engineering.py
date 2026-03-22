"""Feature engineering for flight delay prediction.

Generates ML-ready features from flight, weather, and historical data.
Designed to work with both rule-based scoring and future trained models.
"""

from datetime import datetime, timezone
from typing import Any

import structlog

logger = structlog.get_logger()

# Historical delay rates by carrier (bootstrapped estimates, update with real data)
CARRIER_DELAY_RATES = {
    "AA": 0.22, "DL": 0.16, "UA": 0.20, "B6": 0.24, "NK": 0.30,
    "F9": 0.28, "LA": 0.18, "AV": 0.20, "CM": 0.15, "BA": 0.14,
    "LH": 0.12, "IB": 0.19, "AF": 0.17, "EK": 0.10, "QR": 0.11,
}

# Peak hours at MIA (Eastern time)
PEAK_HOURS = {7, 8, 9, 10, 11, 16, 17, 18, 19, 20}

# Long-haul routes tend to have larger delays
LONG_HAUL_ORIGINS = {
    "LHR", "CDG", "MAD", "FCO", "AMS", "FRA",  # Europe
    "DXB", "DOH",                                 # Middle East
    "GRU", "EZE", "SCL", "BOG", "LIM",           # South America
}


def compute_features(
    flight: dict[str, Any],
    weather: dict[str, Any] | None = None,
    historical_stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compute feature vector for a single flight.

    Args:
        flight: Normalized flight record.
        weather: Latest weather snapshot (or None).
        historical_stats: Pre-computed stats for this route/carrier (or None).

    Returns:
        Dict of named features with float values.
    """
    now = datetime.now(timezone.utc)

    # ── Time features ────────────────────────────────────────────────
    sched_dep = flight.get("scheduled_departure")
    dep_hour = _parse_hour(sched_dep) if sched_dep else now.hour
    dep_dow = _parse_dow(sched_dep) if sched_dep else now.weekday()

    time_features = {
        "hour_of_day": dep_hour,
        "day_of_week": dep_dow,
        "is_peak_hour": 1.0 if dep_hour in PEAK_HOURS else 0.0,
        "is_weekend": 1.0 if dep_dow >= 5 else 0.0,
        "is_evening": 1.0 if dep_hour >= 18 else 0.0,
        "is_redeye": 1.0 if dep_hour <= 5 else 0.0,
    }

    # ── Carrier features ─────────────────────────────────────────────
    airline = flight.get("airline_iata", "")
    carrier_features = {
        "carrier_historical_delay_rate": CARRIER_DELAY_RATES.get(airline, 0.20),
    }

    # ── Route features ───────────────────────────────────────────────
    origin = flight.get("origin_iata", "")
    destination = flight.get("destination_iata", "")
    direction = flight.get("direction", "arrival")

    route_features = {
        "is_long_haul": 1.0 if (
            origin in LONG_HAUL_ORIGINS or destination in LONG_HAUL_ORIGINS
        ) else 0.0,
        "is_arrival": 1.0 if direction == "arrival" else 0.0,
    }

    # ── Weather features ─────────────────────────────────────────────
    weather_features = _compute_weather_features(weather)

    # ── Traffic features (from historical stats) ─────────────────────
    traffic_features = {
        "current_traffic_volume": (
            historical_stats.get("total_active", 0) if historical_stats else 0
        ),
        "current_delayed_pct": (
            historical_stats.get("delayed_pct", 0.0) if historical_stats else 0.0
        ),
    }

    # ── Combine ──────────────────────────────────────────────────────
    features = {
        **time_features,
        **carrier_features,
        **route_features,
        **weather_features,
        **traffic_features,
    }

    return features


def _compute_weather_features(weather: dict[str, Any] | None) -> dict[str, float]:
    """Extract weather-related features."""
    if weather is None:
        return {
            "wind_speed": 0.0,
            "wind_gust": 0.0,
            "precipitation": 0.0,
            "visibility_score": 1.0,
            "is_thunderstorm": 0.0,
            "is_fog": 0.0,
            "weather_severity": 0.0,
        }

    wind = weather.get("wind_speed_knots") or 0.0
    gust = weather.get("wind_gust_knots") or 0.0
    precip = weather.get("precipitation_mm") or 0.0
    vis_km = weather.get("visibility_km")
    is_ts = weather.get("is_thunderstorm", False)
    is_fog = weather.get("is_fog", False)

    # Visibility score: 1.0 = perfect, 0.0 = zero visibility
    if vis_km is not None:
        visibility_score = min(vis_km / 10.0, 1.0)
    else:
        visibility_score = 1.0

    # Composite weather severity: 0.0 = clear, 1.0 = severe
    severity = 0.0
    if wind > 25:
        severity += 0.3
    if wind > 40:
        severity += 0.2
    if precip > 0:
        severity += min(precip / 10.0, 0.3)
    if is_ts:
        severity += 0.4
    if is_fog:
        severity += 0.2
    severity = min(severity, 1.0)

    return {
        "wind_speed": wind,
        "wind_gust": gust,
        "precipitation": precip,
        "visibility_score": visibility_score,
        "is_thunderstorm": 1.0 if is_ts else 0.0,
        "is_fog": 1.0 if is_fog else 0.0,
        "weather_severity": severity,
    }


def _parse_hour(iso: str) -> int:
    """Extract hour from ISO timestamp."""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).hour
    except (ValueError, AttributeError):
        return 12


def _parse_dow(iso: str) -> int:
    """Extract day of week (0=Mon) from ISO timestamp."""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).weekday()
    except (ValueError, AttributeError):
        return 0
