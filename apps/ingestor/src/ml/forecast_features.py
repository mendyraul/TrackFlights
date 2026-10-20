"""Features for the hourly traffic forecast.

Used by both training (apps/ml) and serving (the Pi), so a model always sees
features computed exactly the way it was trained on.

The forecast predicts how many distinct aircraft the receiver will hear in a
given hour from what's knowable ahead of time: the Miami-local hour and
weekday, US holidays, the weather (Open-Meteo's forecast at serving time),
and the same hour one week earlier. It is not autoregressive on the last few
hours, so every hour of the 6-hour horizon is predicted the same way.
"""

import math
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

MIAMI = ZoneInfo("America/New_York")

FEATURES = [
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "is_weekend",
    "is_holiday",
    "temp_c",
    "wind_kt",
    "precip_mm",
    "is_thunderstorm",
    "weather_missing",
    "lag_168",
]

# Neutral stand-ins when an hour has no weather (with weather_missing = 1, so
# a model can learn that the values are not real).
_WEATHER_FILL = {"temp_c": 26.0, "wind_kt": 8.0, "precip_mm": 0.0, "is_thunderstorm": 0.0}


def forecast_features(
    hour_utc: datetime, weather: dict[str, Any] | None, lag_168: float
) -> dict[str, float]:
    """Feature row for one UTC hour. `weather` uses traffic_hourly column names."""
    local = hour_utc.astimezone(MIAMI)
    h = local.hour + local.minute / 60
    dow = local.weekday()  # Monday = 0
    w = weather or {}
    missing = all(w.get(k) is None for k in ("temp_c", "wind_kt", "precip_mm"))

    def wx(key: str) -> float:
        value = w.get(key)
        return float(_WEATHER_FILL[key] if value is None else value)

    return {
        "hour_sin": math.sin(2 * math.pi * h / 24),
        "hour_cos": math.cos(2 * math.pi * h / 24),
        "dow_sin": math.sin(2 * math.pi * dow / 7),
        "dow_cos": math.cos(2 * math.pi * dow / 7),
        "is_weekend": 1.0 if dow >= 5 else 0.0,
        "is_holiday": 1.0 if is_us_holiday(local.date()) else 0.0,
        "temp_c": wx("temp_c"),
        "wind_kt": wx("wind_kt"),
        "precip_mm": wx("precip_mm"),
        "is_thunderstorm": 1.0 if w.get("is_thunderstorm") else 0.0,
        "weather_missing": 1.0 if missing else 0.0,
        "lag_168": float(lag_168),
    }


def weather_from_snapshot(snapshot: dict[str, Any] | None) -> dict[str, Any] | None:
    """Map a weather_snapshots / Open-Meteo row onto traffic_hourly's column names."""
    if not snapshot:
        return None
    return {
        "temp_c": snapshot.get("temperature_c"),
        "wind_kt": snapshot.get("wind_speed_knots"),
        "precip_mm": snapshot.get("precipitation_mm"),
        "is_thunderstorm": snapshot.get("is_thunderstorm"),
    }


# ── US federal holidays (travel patterns shift on these) ────────────────


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    first = date(year, month, 1)
    offset = (weekday - first.weekday()) % 7
    return first + timedelta(days=offset + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> date:
    nxt = date(year + (month == 12), month % 12 + 1, 1)
    last = nxt - timedelta(days=1)
    return last - timedelta(days=(last.weekday() - weekday) % 7)


def is_us_holiday(d: date) -> bool:
    y = d.year
    holidays = {
        date(y, 1, 1),
        _nth_weekday(y, 1, 0, 3),  # MLK Day
        _nth_weekday(y, 2, 0, 3),  # Presidents' Day
        _last_weekday(y, 5, 0),  # Memorial Day
        date(y, 6, 19),
        date(y, 7, 4),
        _nth_weekday(y, 9, 0, 1),  # Labor Day
        _nth_weekday(y, 11, 3, 4),  # Thanksgiving
        date(y, 12, 25),
    }
    return d in holidays
