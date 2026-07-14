"""Streaming ETL for the positions model (tracked_flights + flight_positions).

Aircraft broadcast several times a second; writing every sample would melt the Pi's
network and blow Supabase rate limits. So we:

  1. read the local ``aircraft.json`` every ``stream_read_interval_seconds`` (~1s),
  2. **throttle** per aircraft — keep at most one sample per ``position_throttle_seconds``
     (10–15s) using an in-memory dict keyed by ICAO hex,
  3. **batch** the kept samples and flush them with a single bulk insert every
     ``flush_interval_seconds`` (or sooner if the buffer hits ``batch_max_rows``).

Each flush bulk-inserts the trail into ``flight_positions`` and upserts the latest
state into ``tracked_flights``. The receiver's own coordinates are registered into
``receiver_stations`` from the GPS HAT (or static config).
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import structlog

from src.config import settings
from src.gps.station import StationLocator

logger = structlog.get_logger()

# How often to prune the high-volume flight_positions table (seconds).
PRUNE_INTERVAL_SECONDS = 3600


def to_position_row(
    row: dict[str, Any], station_id: str | None, recorded_at: str
) -> dict[str, Any]:
    """Map a provider position sample to a ``flight_positions`` insert row."""
    return {
        "hex": row["hex"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "altitude_ft": row["altitude_ft"],
        "ground_speed_knots": row["ground_speed_knots"],
        "track_deg": row["track_deg"],
        "vertical_rate_fpm": row["vertical_rate_fpm"],
        "recorded_at": recorded_at,
        "station_id": station_id,
    }


def to_tracked_row(row: dict[str, Any], station_id: str | None, last_seen: str) -> dict[str, Any]:
    """Map a provider position sample to a ``tracked_flights`` upsert row.

    Note: ``first_seen`` is intentionally omitted so the DB default only sets it on
    insert and upserts never overwrite the original value.
    """
    return {
        "hex": row["hex"],
        "callsign": row.get("callsign"),
        "registration": row.get("registration"),
        "aircraft_type": row.get("aircraft_type"),
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "altitude_ft": row["altitude_ft"],
        "ground_speed_knots": row["ground_speed_knots"],
        "track_deg": row["track_deg"],
        "vertical_rate_fpm": row["vertical_rate_fpm"],
        "on_ground": row.get("on_ground", False),
        "last_seen": last_seen,
        "station_id": station_id,
        "updated_at": last_seen,
    }


class PositionBuffer:
    """Per-aircraft time throttle + accumulating buffer of position samples."""

    def __init__(self, throttle_seconds: float, max_rows: int) -> None:
        self.throttle_seconds = throttle_seconds
        self.max_rows = max_rows
        self._last_capture: dict[str, float] = {}  # hex -> monotonic ts of last keep
        self._rows: list[dict[str, Any]] = []  # provider-shape samples awaiting flush

    def offer(self, row: dict[str, Any], now: float) -> bool:
        """Keep this sample unless the same aircraft was captured too recently.

        Returns True if the sample was buffered, False if throttled out.
        """
        hex_id = row.get("hex")
        if not hex_id:
            return False
        last = self._last_capture.get(hex_id)
        if last is not None and (now - last) < self.throttle_seconds:
            return False
        self._last_capture[hex_id] = now
        self._rows.append(row)
        return True

    @property
    def size(self) -> int:
        return len(self._rows)

    def is_full(self) -> bool:
        return len(self._rows) >= self.max_rows

    def drain(self) -> list[dict[str, Any]]:
        """Return and clear the buffered samples (throttle memory is retained)."""
        rows = self._rows
        self._rows = []
        return rows

    def forget_stale(self, now: float, ttl_multiplier: float = 10.0) -> None:
        """Drop throttle entries not seen in a while so the dict can't grow unbounded."""
        cutoff = now - (self.throttle_seconds * ttl_multiplier)
        for hex_id in [h for h, ts in self._last_capture.items() if ts < cutoff]:
            self._last_capture.pop(hex_id, None)


class PositionStreamer:
    """Drives the read → throttle → batch → bulk-write loop."""

    def __init__(
        self,
        provider: Any,
        db: Any,
        locator: StationLocator | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.provider = provider
        self.db = db
        self.locator = locator or StationLocator()
        self._clock = clock
        self._buffer = PositionBuffer(
            throttle_seconds=settings.position_throttle_seconds,
            max_rows=settings.batch_max_rows,
        )
        self._station_id: str | None = settings.station_id
        self._last_flush = clock()
        self._last_station = 0.0
        self._last_prune = clock()

    async def _tick(self) -> None:
        """Read one feed snapshot and offer each in-range sample to the buffer."""
        samples = await self.provider.fetch_positions()
        now = self._clock()
        for sample in samples:
            self._buffer.offer(sample, now)
        self._buffer.forget_stale(now)

    def flush(self) -> int:
        """Write the buffered batch: bulk insert positions + upsert latest tracked state."""
        rows = self._buffer.drain()
        if not rows:
            return 0
        recorded_at = datetime.now(UTC).isoformat()
        positions = [to_position_row(r, self._station_id, recorded_at) for r in rows]
        # Last sample per hex wins for the tracked (latest-state) upsert.
        tracked: dict[str, dict[str, Any]] = {}
        for r in rows:
            tracked[r["hex"]] = to_tracked_row(r, self._station_id, recorded_at)

        self.db.insert_positions(positions)
        self.db.upsert_tracked(list(tracked.values()))
        logger.info("Flushed batch", positions=len(positions), tracked=len(tracked))
        return len(positions)

    def register_station(self) -> None:
        """Read the GPS/static fix and upsert it into receiver_stations."""
        station = self.locator.get_station(force=True)
        if not station:
            logger.warning("No station location available (GPS off and no static config)")
            return
        self._station_id = station["station_id"]
        record = {k: v for k, v in station.items() if k != "source"}
        try:
            self.db.upsert_station(record)
            logger.info(
                "Registered station",
                station_id=station["station_id"],
                source=station["source"],
                lat=station["latitude"],
                lon=station["longitude"],
            )
        except Exception:
            logger.exception("Failed to register station")

    def _maybe_periodic(self) -> None:
        now = self._clock()
        if (now - self._last_station) >= settings.station_refresh_seconds:
            self.register_station()
            self._last_station = now
        if (now - self._last_prune) >= PRUNE_INTERVAL_SECONDS:
            try:
                pruned = self.db.prune_positions()
                logger.info("Pruned positions", **pruned)
            except Exception:
                logger.exception("Prune failed")
            self._last_prune = now

    async def run(self, shutdown: asyncio.Event) -> None:
        """Continuous loop until ``shutdown`` is set."""
        self.register_station()
        self._last_station = self._clock()
        self._last_flush = self._clock()

        while not shutdown.is_set():
            try:
                await self._tick()
                now = self._clock()
                if (
                    self._buffer.is_full()
                    or (now - self._last_flush) >= settings.flush_interval_seconds
                ):
                    self.flush()
                    self._last_flush = now
                self._maybe_periodic()
            except Exception:
                logger.exception("Error during stream tick")

            try:
                await asyncio.wait_for(
                    shutdown.wait(), timeout=settings.stream_read_interval_seconds
                )
            except TimeoutError:
                pass  # normal: time for the next read

        # Final flush so we don't drop a partial batch on shutdown.
        self.flush()
        logger.info("Position streamer shutdown complete")
