"""Supabase client wrapper for flight data operations."""

import time
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from supabase import Client, create_client

from src.config import settings
from src.services.flight_diff_engine import TRACKED_FIELDS

logger = structlog.get_logger()

# Projection for flights_current reads: identity + everything the diff engine
# compares, so DB rows key and diff correctly against provider output.
CURRENT_FLIGHTS_COLUMNS = ",".join(
    ["id", "flight_iata", "updated_at", "data_source", *TRACKED_FIELDS]
)

# Statuses considered "completed" for archival purposes
COMPLETED_STATUSES = ["landed", "arrived", "departed", "cancelled"]

# How long after last update before a completed flight gets archived
ARCHIVE_AGE_HOURS = 2

# How many consecutive cycles a flight must be absent before marking stale
STALE_THRESHOLD_MINUTES = 10


class SupabaseFlightClient:
    """Handles all Supabase read/write operations for flight data."""

    def __init__(self) -> None:
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        # In-process view of flights_current, keyed by flight_iata. Reading the
        # table from the Pi counts against Supabase egress, so between periodic
        # reconciles we serve reads from this cache and fold our own upserts
        # into it.
        self._current_cache: dict[str, dict[str, Any]] | None = None
        self._cache_fetched_at = 0.0

    def get_current_flights(self) -> list[dict[str, Any]]:
        """Return flights_current rows, served from the in-process cache.

        Re-reads the table only when the cache is older than
        settings.current_cache_refresh_seconds.
        """
        cache_age = time.monotonic() - self._cache_fetched_at
        if (
            self._current_cache is not None
            and cache_age < settings.current_cache_refresh_seconds
        ):
            return [dict(row) for row in self._current_cache.values()]

        result = (
            self.client.table("flights_current")
            .select(CURRENT_FLIGHTS_COLUMNS)
            .execute()
        )
        rows = result.data or []
        self._current_cache = {
            row["flight_iata"]: dict(row) for row in rows if row.get("flight_iata")
        }
        self._cache_fetched_at = time.monotonic()
        logger.info("Refreshed flights_current cache", rows=len(rows))
        return rows

    def upsert_flights(self, flights: list[dict[str, Any]]) -> int:
        """Upsert flights into flights_current.

        Only sends rows that have actually changed (caller handles diffing).
        Returns the number of rows upserted.
        """
        if not flights:
            return 0

        # Batch in chunks of 50 to avoid oversized requests
        batch_size = 50
        total = 0
        for i in range(0, len(flights), batch_size):
            batch = flights[i : i + batch_size]
            self.client.table("flights_current").upsert(
                batch,
                on_conflict="flight_iata",
            ).execute()
            total += len(batch)

        # Fold our writes into the cache so reads stay accurate between
        # reconciles. Merge (not replace): the upsert leaves omitted columns
        # untouched, and another data source may own those fields.
        if self._current_cache is not None:
            now_iso = datetime.now(UTC).isoformat()
            for flight in flights:
                key = flight.get("flight_iata")
                if not key:
                    continue
                cached = self._current_cache.get(key)
                if cached is None:
                    cached = self._current_cache[key] = {}
                cached.update(flight)
                cached["updated_at"] = now_iso

        logger.info("Upserted flights", count=total)
        return total

    def mark_stale_flights(self, removed: list[dict[str, Any]]) -> int:
        """Handle flights that are in the DB but no longer returned by the API.

        Only marks flights as stale if they've been inactive for a while,
        to avoid false positives from API pagination or temporary outages.
        """
        if not removed:
            return 0

        cutoff = (datetime.now(UTC) - timedelta(minutes=STALE_THRESHOLD_MINUTES)).isoformat()

        # Only mark flights that haven't been updated recently. Rows folded
        # into the cache from our own upserts may lack an id — skip those.
        stale_ids = [
            row["id"]
            for row in removed
            if row.get("id") is not None
            and row.get("updated_at", "") < cutoff
            and row.get("status") not in COMPLETED_STATUSES
        ]

        if not stale_ids:
            return 0

        # Don't delete — just log. The archival process will handle cleanup.
        # In a future iteration, these could be marked with a "stale" flag.
        logger.info(
            "Stale flights detected",
            count=len(stale_ids),
            ids=stale_ids[:10],  # Log first 10
        )

        return len(stale_ids)

    def archive_completed_flights(self) -> int:
        """Archival is disabled in free-tier mode to avoid write amplification.

        Keeping only flights_current + short retention pruning is cheaper and avoids
        schema drift issues between current/history tables.
        """
        return 0

    def prune_old_data(self) -> dict[str, int]:
        """Prune old high-volume tables to stay within free-tier storage."""
        now = datetime.now(UTC)
        pruned: dict[str, int] = {
            "history_pruned": 0,
            "weather_pruned": 0,
            "anomalies_pruned": 0,
        }

        # flights_history
        history_cutoff = (now - timedelta(days=settings.flights_history_retention_days)).isoformat()
        hist = (
            self.client.table("flights_history")
            .delete()
            .lt("archived_at", history_cutoff)
            .execute()
        )
        pruned["history_pruned"] = len(hist.data or [])

        # weather_snapshots
        weather_cutoff = (now - timedelta(days=settings.weather_retention_days)).isoformat()
        w = (
            self.client.table("weather_snapshots")
            .delete()
            .lt("observed_at", weather_cutoff)
            .execute()
        )
        pruned["weather_pruned"] = len(w.data or [])

        # resolved/old anomalies
        anomaly_cutoff = (now - timedelta(days=settings.anomalies_retention_days)).isoformat()
        a = (
            self.client.table("traffic_anomalies")
            .delete()
            .eq("is_active", False)
            .lt("resolved_at", anomaly_cutoff)
            .execute()
        )
        pruned["anomalies_pruned"] = len(a.data or [])

        return pruned

    def get_flight_stats(self) -> dict[str, int]:
        """Get counts by status for logging."""
        result = self.client.table("flights_current").select("status").execute()
        rows = result.data or []
        stats: dict[str, int] = {}
        for row in rows:
            s = row.get("status", "unknown")
            stats[s] = stats.get(s, 0) + 1
        return stats
