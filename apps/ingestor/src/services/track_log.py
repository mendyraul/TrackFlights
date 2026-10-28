"""Local position history on the Pi, for training the phase classifier.

Every poll, the ADS-B provider observes every in-range aircraft. This keeps a
sampled copy of those observations in a SQLite file on the Pi (SD card or USB
drive), so training data never has to be downloaded from Supabase (egress).

Disk use is bounded three ways, all set from the environment:
  * sampling: at most one row per aircraft per TRACK_LOG_SAMPLE_SECONDS,
  * retention: rows older than TRACK_LOG_RETENTION_DAYS are deleted hourly,
  * hard cap: past TRACK_LOG_MAX_MB the oldest rows go first, and writes pause
    while the disk has less than TRACK_LOG_MIN_FREE_MB free.

Nothing here may break ingestion: the poller wraps every call.
"""

import os
import shutil
import sqlite3
import time
from collections.abc import Callable
from typing import Any

import structlog

logger = structlog.get_logger()

_SCHEMA = """
CREATE TABLE IF NOT EXISTS positions (
  ts INTEGER NOT NULL,          -- epoch seconds (UTC)
  hex TEXT NOT NULL,            -- ICAO 24-bit address, uppercase
  callsign TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  alt_ft INTEGER,               -- 0 on the ground
  vrate_fpm INTEGER,
  gs_kt INTEGER,
  track REAL,
  on_ground INTEGER NOT NULL,   -- 0/1
  dist_km REAL                  -- distance to KMIA
);
CREATE INDEX IF NOT EXISTS positions_hex_ts ON positions (hex, ts);
CREATE INDEX IF NOT EXISTS positions_ts ON positions (ts);
"""

_COLUMNS = (
    "ts",
    "hex",
    "callsign",
    "lat",
    "lon",
    "alt_ft",
    "vrate_fpm",
    "gs_kt",
    "track",
    "on_ground",
    "dist_km",
)

MB = 1024 * 1024


class TrackLog:
    def __init__(
        self,
        path: str,
        sample_seconds: int = 30,
        retention_days: int = 30,
        max_mb: int = 1024,
        min_free_mb: int = 1024,
        clock: Callable[[], float] = time.time,
        disk_usage: Callable[[str], Any] = shutil.disk_usage,
    ) -> None:
        self.path = path
        self.sample_seconds = sample_seconds
        self.retention_days = retention_days
        self.max_mb = max_mb
        self.min_free_mb = min_free_mb
        self._clock = clock
        self._disk_usage = disk_usage
        self._last_written: dict[str, int] = {}
        self._paused = False

        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        # auto_vacuum must be set before the first table exists, so the file
        # can actually shrink after pruning (incremental_vacuum below).
        self._db.execute("PRAGMA auto_vacuum = INCREMENTAL")
        self._db.execute("PRAGMA journal_mode = WAL")
        self._db.execute("PRAGMA synchronous = NORMAL")
        self._db.executescript(_SCHEMA)
        self._db.commit()

    # ── Writing ─────────────────────────────────────────────────────────

    def record(self, observations: list[dict[str, Any]]) -> int:
        """Store a poll's observations, sampled per aircraft. Returns rows written."""
        if self._disk_low():
            return 0

        now = int(self._clock())
        rows = []
        for obs in observations:
            hex_id = obs.get("hex")
            if not hex_id or obs.get("lat") is None or obs.get("lon") is None:
                continue
            last = self._last_written.get(hex_id)
            if last is not None and now - last < self.sample_seconds:
                continue
            self._last_written[hex_id] = now
            rows.append(
                (
                    now,
                    hex_id,
                    obs.get("callsign") or None,
                    obs["lat"],
                    obs["lon"],
                    obs.get("alt_ft"),
                    obs.get("vrate_fpm"),
                    obs.get("gs_kt"),
                    obs.get("track"),
                    1 if obs.get("on_ground") else 0,
                    obs.get("distance_km"),
                )
            )

        # Aircraft that left range: forget them so the dict can't grow forever.
        if len(self._last_written) > 5000:
            cutoff = now - 3600
            self._last_written = {h: t for h, t in self._last_written.items() if t >= cutoff}

        if rows:
            placeholders = ",".join("?" * len(_COLUMNS))
            self._db.executemany(
                f"INSERT INTO positions ({','.join(_COLUMNS)}) VALUES ({placeholders})", rows
            )
            self._db.commit()
        return len(rows)

    def _disk_low(self) -> bool:
        free_mb = self._disk_usage(os.path.dirname(os.path.abspath(self.path))).free / MB
        low = free_mb < self.min_free_mb
        if low != self._paused:
            self._paused = low
            if low:
                logger.warning(
                    "Track log paused: disk almost full",
                    path=self.path,
                    free_mb=round(free_mb),
                    min_free_mb=self.min_free_mb,
                )
            else:
                logger.info("Track log resumed", path=self.path, free_mb=round(free_mb))
        return low

    # ── Housekeeping ────────────────────────────────────────────────────

    def size_mb(self) -> float:
        total = 0
        for suffix in ("", "-wal"):
            try:
                total += os.path.getsize(self.path + suffix)
            except OSError:
                pass
        return total / MB

    def prune(self) -> int:
        """Apply retention, then the size cap (oldest day first). Returns rows deleted."""
        now = int(self._clock())
        deleted = self._db.execute(
            "DELETE FROM positions WHERE ts < ?", (now - self.retention_days * 86400,)
        ).rowcount
        self._db.commit()
        # Reclaim WAL/free pages before deciding whether more rows must go.
        self._compact()

        while self.size_mb() > self.max_mb:
            oldest = self._db.execute("SELECT MIN(ts) FROM positions").fetchone()[0]
            if oldest is None:
                break
            n = self._db.execute("DELETE FROM positions WHERE ts < ?", (oldest + 86400,)).rowcount
            self._db.commit()
            self._compact()
            deleted += n
            if n == 0:
                break

        if deleted:
            self._compact()
            logger.info("Track log pruned", rows_deleted=deleted, size_mb=round(self.size_mb(), 1))
        return deleted

    def _compact(self) -> None:
        # Older SQLite/Python combinations reclaim only one page per call,
        # even when all pragma rows are fetched. Continue while freelist pages
        # decrease; batch this in a transaction to avoid a commit per page.
        self._db.execute("BEGIN")
        try:
            free = self._db.execute("PRAGMA freelist_count").fetchone()[0]
            while free:
                self._db.execute("PRAGMA incremental_vacuum(256)").fetchall()
                remaining = self._db.execute("PRAGMA freelist_count").fetchone()[0]
                if remaining >= free:
                    break
                free = remaining
            self._db.commit()
        except Exception:
            self._db.rollback()
            raise
        self._db.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchall()

    # ── Reporting ───────────────────────────────────────────────────────

    def stats(self) -> dict[str, Any]:
        return describe(self._db, self.path, self._disk_usage, self.max_mb)

    def close(self) -> None:
        self._db.close()


def describe(
    db: sqlite3.Connection,
    path: str,
    disk_usage: Callable[[str], Any] = shutil.disk_usage,
    max_mb: float | None = None,
) -> dict[str, Any]:
    """Size, growth rate and headroom, measured from the data actually stored."""
    rows, first, last, aircraft = db.execute(
        "SELECT COUNT(*), MIN(ts), MAX(ts), COUNT(DISTINCT hex) FROM positions"
    ).fetchone()
    size_mb = sum(os.path.getsize(path + s) for s in ("", "-wal") if os.path.exists(path + s)) / MB
    free_mb = disk_usage(os.path.dirname(os.path.abspath(path))).free / MB
    span_days = (last - first) / 86400 if rows and last > first else 0.0

    # Only project once there's an hour of data; less than that is noise.
    mb_per_day = size_mb / span_days if span_days >= 1 / 24 else None
    out: dict[str, Any] = {
        "path": path,
        "rows": rows,
        "aircraft": aircraft,
        "days_of_data": round(span_days, 2),
        "size_mb": round(size_mb, 1),
        "free_mb": round(free_mb),
        "mb_per_day": round(mb_per_day, 1) if mb_per_day else None,
        "rows_per_day": round(rows / span_days) if span_days >= 1 / 24 else None,
    }
    if mb_per_day:
        out["days_until_disk_full"] = round(free_mb / mb_per_day)
        if max_mb:
            out["days_kept_at_max_mb"] = round(max_mb / mb_per_day, 1)
    return out
