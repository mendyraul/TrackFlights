"""Supabase client wrapper for flight data operations."""

from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from supabase import Client, create_client

from src.config import settings

logger = structlog.get_logger()

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

    def get_current_flights(self) -> list[dict[str, Any]]:
        """Fetch all rows from flights_current."""
        result = (
            self.client.table("flights_current")
            .select("id,flight_iata,status,updated_at")
            .execute()
        )
        return result.data or []

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

        logger.info("Upserted flights", count=total)
        return total

    # ------------------------------------------------------------------
    # Positions model (tracked_flights + flight_positions + receiver_stations)
    # ------------------------------------------------------------------

    def insert_positions(self, positions: list[dict[str, Any]]) -> int:
        """Bulk-insert position samples into flight_positions (append-only trail)."""
        if not positions:
            return 0
        batch_size = 50
        total = 0
        for i in range(0, len(positions), batch_size):
            batch = positions[i : i + batch_size]
            self.client.table("flight_positions").insert(batch).execute()
            total += len(batch)
        return total

    def upsert_tracked(self, tracked: list[dict[str, Any]]) -> int:
        """Upsert latest aircraft state into tracked_flights (one row per ICAO hex)."""
        if not tracked:
            return 0
        batch_size = 50
        total = 0
        for i in range(0, len(tracked), batch_size):
            batch = tracked[i : i + batch_size]
            self.client.table("tracked_flights").upsert(batch, on_conflict="hex").execute()
            total += len(batch)
        return total

    def upsert_station(self, station: dict[str, Any]) -> None:
        """Register/refresh this receiver's coordinates in receiver_stations."""
        self.client.table("receiver_stations").upsert(station, on_conflict="station_id").execute()

    def prune_positions(self) -> dict[str, int]:
        """Delete trail history and stale aircraft to stay under free-tier storage."""
        now = datetime.now(UTC)
        positions_cutoff = (now - timedelta(hours=settings.positions_retention_hours)).isoformat()
        pos = (
            self.client.table("flight_positions")
            .delete()
            .lt("recorded_at", positions_cutoff)
            .execute()
        )
        tracked_cutoff = (now - timedelta(minutes=settings.tracked_stale_minutes)).isoformat()
        trk = (
            self.client.table("tracked_flights").delete().lt("last_seen", tracked_cutoff).execute()
        )
        return {
            "positions_pruned": len(pos.data or []),
            "tracked_pruned": len(trk.data or []),
        }

    def mark_stale_flights(self, removed: list[dict[str, Any]]) -> int:
        """Handle flights that are in the DB but no longer returned by the API.

        Only marks flights as stale if they've been inactive for a while,
        to avoid false positives from API pagination or temporary outages.
        """
        if not removed:
            return 0

        cutoff = (datetime.now(UTC) - timedelta(minutes=STALE_THRESHOLD_MINUTES)).isoformat()

        # Only mark flights that haven't been updated recently
        stale_ids = [
            row["id"]
            for row in removed
            if row.get("updated_at", "") < cutoff and row.get("status") not in COMPLETED_STATUSES
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
