"""Flight phase relative to MIA, inferred from ADS-B state.

ADS-B carries no arrival/departure board, so phase is a heuristic over what
the transponder does report. Vertical rate alone (the previous rule) called
every cruising overflight a "departure" and every holding aircraft whatever
its last bump in altitude was. This adds distance to KMIA and track:

  * terminal area (< 60 km, < 12,000 ft): descending => arriving, whatever the
    track (downwind legs fly *away* from the runway before turning in);
    climbing and not pointed at MIA => departing; low, level and lined up =>
    final approach; anything else (holding, VFR) => overflight;
  * wider area (< 200 km, < 25,000 ft): only call it when the geometry agrees
    with the vertical trend (descending toward MIA / climbing away from it);
  * everything else is an overflight.

Without a flight plan an arrival into FLL looks like an arrival into MIA.

Kept in step with apps/web/src/lib/phase.ts, which the site uses for display.
"""

from math import asin, atan2, cos, degrees, radians, sin, sqrt
from typing import Literal

Phase = Literal["arriving", "departing", "overflight", "on-ground", "unknown"]

KMIA_LAT = 25.79325
KMIA_LON = -80.29056
_EARTH_RADIUS_KM = 6371.0
VRATE_FPM = 300


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * asin(sqrt(a))


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing from point 1 to point 2, 0-360 degrees."""
    y = sin(radians(lon2 - lon1)) * cos(radians(lat2))
    x = cos(radians(lat1)) * sin(radians(lat2)) - sin(radians(lat1)) * cos(radians(lat2)) * cos(
        radians(lon2 - lon1)
    )
    return (degrees(atan2(y, x)) + 360) % 360


def _angle_between(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def infer_phase(
    lat: float | None,
    lon: float | None,
    altitude_ft: int | None,
    vertical_rate_fpm: float | None,
    track: float | None,
    on_ground: bool = False,
) -> Phase:
    if lat is None or lon is None:
        return "unknown"
    if on_ground or altitude_ft == 0:
        return "on-ground"
    if altitude_ft is None:
        return "unknown"

    dist = distance_km(lat, lon, KMIA_LAT, KMIA_LON)
    vr = vertical_rate_fpm or 0
    descending = vr <= -VRATE_FPM
    climbing = vr >= VRATE_FPM

    offset = (
        None if track is None else _angle_between(track, bearing_deg(lat, lon, KMIA_LAT, KMIA_LON))
    )
    towards = offset is not None and offset <= 75
    away = offset is not None and offset >= 105

    if dist <= 60 and altitude_ft < 12_000:
        if descending:
            return "arriving"
        if climbing and not towards:
            return "departing"
        if altitude_ft < 3_000 and dist <= 20 and towards:
            return "arriving"
        return "overflight"

    if dist <= 200 and altitude_ft < 25_000:
        if descending and towards:
            return "arriving"
        if climbing and away:
            return "departing"

    return "overflight"
