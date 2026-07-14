"""Helpers for sizing FlightAware AeroAPI polling and frontend egress safely."""

from __future__ import annotations

from dataclasses import dataclass

MONTH_SECONDS = 30 * 24 * 60 * 60
BYTES_PER_GIB = 1024**3
SUPABASE_FREE_EGRESS_GIB = 5.0
DEFAULT_AEROAPI_RESULT_LIMIT = 15


@dataclass(frozen=True)
class BoundingBox:
    """Simple lat/lon bounding box for AeroAPI region searches."""

    min_lat: float
    min_lon: float
    max_lat: float
    max_lon: float


def parse_bounding_box(raw: str) -> BoundingBox:
    """Parse a `min_lat,min_lon,max_lat,max_lon` string into floats."""
    parts = [part.strip() for part in raw.split(",")]
    if len(parts) != 4:
        raise ValueError("AEROAPI_BBOX must have 4 comma-separated numbers")

    try:
        min_lat, min_lon, max_lat, max_lon = (float(part) for part in parts)
    except ValueError as exc:  # pragma: no cover - exercised via tests
        raise ValueError("AEROAPI_BBOX values must be numeric") from exc

    if not -90 <= min_lat <= 90 or not -90 <= max_lat <= 90:
        raise ValueError("AEROAPI_BBOX latitude values must be between -90 and 90")
    if not -180 <= min_lon <= 180 or not -180 <= max_lon <= 180:
        raise ValueError("AEROAPI_BBOX longitude values must be between -180 and 180")
    if min_lat >= max_lat:
        raise ValueError("AEROAPI_BBOX min_lat must be less than max_lat")
    if min_lon >= max_lon:
        raise ValueError("AEROAPI_BBOX min_lon must be less than max_lon")

    return BoundingBox(min_lat=min_lat, min_lon=min_lon, max_lat=max_lat, max_lon=max_lon)


def estimate_monthly_search_requests(
    poll_interval_seconds: int,
    pages_per_poll: int,
) -> int:
    """Estimate how many AeroAPI search requests a given poll plan spends monthly."""
    if poll_interval_seconds <= 0:
        raise ValueError("poll_interval_seconds must be > 0")
    if pages_per_poll <= 0:
        raise ValueError("pages_per_poll must be > 0")

    polls_per_month = MONTH_SECONDS / poll_interval_seconds
    return int(round(polls_per_month * pages_per_poll))


def estimate_monthly_result_rows(
    poll_interval_seconds: int,
    pages_per_poll: int,
    results_per_page: int = DEFAULT_AEROAPI_RESULT_LIMIT,
) -> int:
    """Estimate the maximum monthly flight rows retrieved from AeroAPI."""
    if results_per_page <= 0:
        raise ValueError("results_per_page must be > 0")

    monthly_requests = estimate_monthly_search_requests(poll_interval_seconds, pages_per_poll)
    return monthly_requests * results_per_page


def estimate_monthly_snapshot_egress_gib(
    snapshot_size_kib: float,
    refresh_interval_seconds: int,
) -> float:
    """Estimate monthly Supabase egress for one cached snapshot refresh cadence."""
    if snapshot_size_kib <= 0:
        raise ValueError("snapshot_size_kib must be > 0")
    if refresh_interval_seconds <= 0:
        raise ValueError("refresh_interval_seconds must be > 0")

    refreshes_per_month = MONTH_SECONDS / refresh_interval_seconds
    monthly_bytes = refreshes_per_month * snapshot_size_kib * 1024
    return round(monthly_bytes / BYTES_PER_GIB, 3)


def estimate_supabase_daily_egress_budget_mib(limit_gib: float = SUPABASE_FREE_EGRESS_GIB) -> float:
    """Turn a monthly GiB ceiling into a simple daily MiB budget."""
    if limit_gib <= 0:
        raise ValueError("limit_gib must be > 0")
    return round((limit_gib * 1024) / 30, 1)
