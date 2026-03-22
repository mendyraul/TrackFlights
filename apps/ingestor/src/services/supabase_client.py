"""Supabase client wrapper for flight data operations."""

from typing import Any

import structlog
from supabase import create_client, Client

from src.config import settings

logger = structlog.get_logger()


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

        Returns the number of rows upserted.
        """
        if not flights:
            return 0

        self.client.table("flights_current").upsert(
            flights,
            on_conflict="flight_iata,scheduled_departure",
        ).execute()

        return len(flights)

    def archive_completed_flights(self) -> int:
        """Move landed/arrived/departed/cancelled flights older than 2 hours
        from flights_current to flights_history.

        Returns the count of archived flights.
        """
        from datetime import datetime, timedelta, timezone

        cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()

        # Find completed flights past the cutoff
        result = (
            self.client.table("flights_current")
            .select("*")
            .in_("status", ["landed", "arrived", "departed", "cancelled"])
            .lt("updated_at", cutoff)
            .execute()
        )

        rows = result.data or []
        if not rows:
            return 0

        # Insert into history
        history_rows = []
        for row in rows:
            history_row = {k: v for k, v in row.items() if k != "raw_data"}
            history_row.pop("id", None)  # Let history generate its own ID
            history_rows.append(history_row)

        self.client.table("flights_history").insert(history_rows).execute()

        # Delete from current
        ids = [row["id"] for row in rows]
        self.client.table("flights_current").delete().in_("id", ids).execute()

        logger.info("Archived flights", count=len(rows))
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
