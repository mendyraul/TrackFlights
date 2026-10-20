"""Features for the learned arrival/departure classifier.

Shared by training (apps/ml, from the Pi's track log) and serving (the
ingestor, from its recent polls), so the model sees identical inputs.

One feature row describes an aircraft at one moment: its state (altitude,
vertical rate, speed, distance to KMIA, how directly it's pointed at KMIA,
Miami-local time) and how it has been changing: altitude change over the
last ~60 s and ~120 s and speed change over ~60 s, taken from the nearest
earlier position inside a window. When no earlier position falls in the
window (a new aircraft, a gap in reception), the change is estimated from
the current vertical rate (speed change: 0), the same way in both places.
"""

import math
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from src.ml.forecast_features import MIAMI
from src.services.phase import KMIA_LAT, KMIA_LON, bearing_deg, distance_km

FEATURES = [
    "alt_ft",
    "vrate_fpm",
    "gs_kt",
    "dist_km",
    "offset_deg",
    "alt_change_60",
    "alt_change_120",
    "gs_change_60",
    "hour_sin",
    "hour_cos",
]

# (target seconds back, accepted window) for each change feature.
_WINDOWS = {60: (40, 90), 120: (100, 160)}

# Model classes and the site's phase names for them.
CLASSES = ["arrival_mia", "departure_mia", "other_airport", "overflight"]
CLASS_TO_PHASE = {
    "arrival_mia": "arriving",
    "departure_mia": "departing",
    "other_airport": "other-airport",
    "overflight": "overflight",
}


def _angle_between(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def _earlier(point: dict[str, Any], history: Sequence[dict[str, Any]], seconds: int):
    lo, hi = _WINDOWS[seconds]
    best, best_gap = None, None
    for h in history:
        age = point["ts"] - h["ts"]
        if lo <= age <= hi and h.get("alt_ft") is not None:
            gap = abs(age - seconds)
            if best_gap is None or gap < best_gap:
                best, best_gap = h, gap
    return best


def phase_features(
    point: dict[str, Any], history: Sequence[dict[str, Any]]
) -> dict[str, float] | None:
    """Feature row for `point`, or None if it lacks altitude or position.

    `point` / `history` items: ts (epoch s), lat, lon, alt_ft, vrate_fpm,
    gs_kt, track. `history` holds earlier positions of the same aircraft.
    """
    if point.get("alt_ft") is None or point.get("lat") is None or point.get("lon") is None:
        return None

    alt = float(point["alt_ft"])
    vrate = float(point.get("vrate_fpm") or 0)
    gs = float(point.get("gs_kt") or 0)
    lat, lon = point["lat"], point["lon"]
    track = point.get("track")
    offset = (
        90.0
        if track is None
        else _angle_between(float(track), bearing_deg(lat, lon, KMIA_LAT, KMIA_LON))
    )

    changes: dict[str, float] = {}
    for seconds in (60, 120):
        prev = _earlier(point, history, seconds)
        if prev is not None:
            changes[f"alt_change_{seconds}"] = alt - float(prev["alt_ft"])
        else:
            changes[f"alt_change_{seconds}"] = vrate * seconds / 60
    prev = _earlier(point, history, 60)
    changes["gs_change_60"] = (
        gs - float(prev["gs_kt"]) if prev is not None and prev.get("gs_kt") is not None else 0.0
    )

    local = datetime.fromtimestamp(point["ts"], UTC).astimezone(MIAMI)
    h = local.hour + local.minute / 60
    return {
        "alt_ft": alt,
        "vrate_fpm": vrate,
        "gs_kt": gs,
        "dist_km": distance_km(lat, lon, KMIA_LAT, KMIA_LON),
        "offset_deg": offset,
        **changes,
        "hour_sin": math.sin(2 * math.pi * h / 24),
        "hour_cos": math.cos(2 * math.pi * h / 24),
    }
