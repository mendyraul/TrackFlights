"""Supabase client wrapper for flight data operations."""

from datetime import datetime, timedelta, timezone
from typing import Any

import structlog
from supabase import create_client, Client

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
        result = self.client.table("flights_current").select("*").execute()
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

    def mark_stale_flights(self, removed: list[dict[str, Any]]) -> int:
        """Handle flights that are in the DB but no longer returned by the API.

        Only marks flights as stale if they've been inactive for a while,
        to avoid false positives from API pagination or temporary outages.
        """
        if not removed:
            return 0

        cutoff = (
            datetime.now(timezone.utc) - timedelta(minutes=STALE_THRESHOLD_MINUTES)
        ).isoformat()

        # Only mark flights that haven't been updated recently
        stale_ids = [
            row["id"]
            for row in removed
            if row.get("updated_at", "") < cutoff
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
        """Move completed flights older than ARCHIVE_AGE_HOURS
        from flights_current to flights_history.

        Returns the count of archived flights.
        """
        cutoff = (
            datetime.now(timezone.utc) - timedelta(hours=ARCHIVE_AGE_HOURS)
        ).isoformat()

        # Find completed flights past the cutoff
        result = (
            self.client.table("flights_current")
            .select("*")
            .in_("status", COMPLETED_STATUSES)
            .lt("updated_at", cutoff)
            .execute()
        )

        rows = result.data or []
        if not rows:
            return 0

        # Insert into history (batch)
        history_rows = []
        for row in rows:
            history_row = {k: v for k, v in row.items() if k != "raw_data"}
            history_row.pop("id", None)  # Let history generate its own ID
            history_rows.append(history_row)

        batch_size = 50
        for i in range(0, len(history_rows), batch_size):
            batch = history_rows[i : i + batch_size]
            self.client.table("flights_history").insert(batch).execute()

        # Delete from current
        ids = [row["id"] for row in rows]
        for i in range(0, len(ids), batch_size):
            batch = ids[i : i + batch_size]
            self.client.table("flights_current").delete().in_("id", batch).execute()

        logger.info(
            "Archived flights to history",
            count=len(rows),
            sample=[r.get("flight_iata") for r in rows[:5]],
        )
        return len(rows)

    def get_flight_stats(self) -> dict[str, int]:
        """Get counts by status for logging."""
        result = self.client.table("flights_current").select("status").execute()
        rows = result.data or []
        stats: dict[str, int] = {}
        for row in rows:
            s = row.get("status", "unknown")
            stats[s] = stats.get(s, 0) + 1
        return stats
