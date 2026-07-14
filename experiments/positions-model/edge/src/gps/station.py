"""Resolve this receiver's location — from the GPS HAT when available, else static config.

Auto-registering the station coordinates means the rig can be moved and the map's
receiver location follows automatically, with no manual recalibration. The fix is
cached and only refreshed every ``station_refresh_seconds`` so we don't hammer the
serial port.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import structlog

from src.config import settings
from src.gps.nmea_reader import read_fix

logger = structlog.get_logger()

# Type of the injectable GPS reader (overridden in tests).
FixReader = Callable[[], dict[str, float | None] | None]


class StationLocator:
    """Provides the current receiver-station record, GPS-first with static fallback."""

    def __init__(
        self,
        fix_reader: FixReader | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._clock = clock
        self._fix_reader = fix_reader or self._default_fix_reader
        self._cached: dict[str, Any] | None = None
        self._cached_at: float | None = None

    @staticmethod
    def _default_fix_reader() -> dict[str, float | None] | None:
        return read_fix(
            settings.gps_serial_port,
            settings.gps_baud,
            timeout=settings.gps_read_timeout_seconds,
        )

    def get_station(self, force: bool = False) -> dict[str, Any] | None:
        """Return the station record, refreshing from GPS at the configured interval.

        Falls back to static ``station_lat``/``station_lon`` config when GPS is
        disabled or yields no fix. Returns ``None`` only if neither source has a
        position (positions will then be stored without a station fix).
        """
        now = self._clock()
        fresh = (
            self._cached is not None
            and self._cached_at is not None
            and not force
            and (now - self._cached_at) < settings.station_refresh_seconds
        )
        if fresh:
            return self._cached

        record = self._resolve()
        if record is not None:
            self._cached = record
            self._cached_at = now
        return record or self._cached

    def _resolve(self) -> dict[str, Any] | None:
        lat: float | None = settings.station_lat
        lon: float | None = settings.station_lon
        alt: float | None = settings.station_alt_m
        source = "static"

        if settings.gps_enabled:
            fix = self._fix_reader()
            if fix and fix.get("latitude") is not None and fix.get("longitude") is not None:
                lat = fix["latitude"]
                lon = fix["longitude"]
                alt = fix.get("altitude_m", alt)
                source = "gps"
            else:
                logger.warning("GPS enabled but no fix; using static station coordinates")

        if lat is None or lon is None:
            return None

        return {
            "station_id": settings.station_id,
            "latitude": lat,
            "longitude": lon,
            "altitude_m": alt,
            "source": source,
            "last_updated": datetime.now(UTC).isoformat(),
        }
