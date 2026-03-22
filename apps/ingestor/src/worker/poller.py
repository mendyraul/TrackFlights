"""Polling worker — orchestrates the full ingestion cycle."""

import structlog

from src.config import settings
from src.providers.base_provider import BaseFlightProvider
from src.services.supabase_client import SupabaseFlightClient
from src.services.flight_normalizer import normalize_batch
from src.services.flight_diff_engine import compute_diff

logger = structlog.get_logger()


class Poller:
    """Runs a single poll-normalize-diff-upsert cycle.

    Lifecycle per cycle:
        1. Fetch arrivals + departures from the provider
        2. Normalize all records to canonical schema
        3. Load current flights from Supabase
        4. Diff to find new / updated / removed flights
        5. Upsert only changed flights (minimal writes)
        6. Mark stale flights (in DB but gone from API)
        7. Archive old completed flights to flights_history
        8. Log detailed statistics
    """

    def __init__(self, provider: BaseFlightProvider) -> None:
        self.provider = provider
        self.db = SupabaseFlightClient()
        self._cycle_count = 0

    async def execute(self) -> dict[str, int]:
        """Run one full poll cycle. Returns stats dict."""
        self._cycle_count += 1
        airport = settings.mia_iata_code

        logger.info(
            "Poll cycle starting",
            cycle=self._cycle_count,
            provider=self.provider.name,
            airport=airport,
        )

        # 1. Fetch from provider
        raw_arrivals = await self.provider.fetch_arrivals(airport)
        raw_departures = await self.provider.fetch_departures(airport)

        logger.info(
            "Fetched raw flights",
            arrivals=len(raw_arrivals),
            departures=len(raw_departures),
        )

        # 2. Normalize
        arrivals = normalize_batch(self.provider, raw_arrivals, "arrival")
        departures = normalize_batch(self.provider, raw_departures, "departure")
        all_normalized = arrivals + departures

        # 3. Load current state
        current_db = self.db.get_current_flights()

        # 4. Diff
        diff = compute_diff(all_normalized, current_db)

        # 5. Upsert only new + updated (minimal writes)
        upserted = self.db.upsert_flights(diff.to_upsert)

        # 6. Mark removed flights as stale (update status if they disappeared)
        stale_marked = 0
        if diff.removed:
            stale_marked = self.db.mark_stale_flights(diff.removed)

        # 7. Archive old completed flights
        archived = self.db.archive_completed_flights()

        # 8. Stats
        stats = {
            "cycle": self._cycle_count,
            "fetched_arrivals": len(raw_arrivals),
            "fetched_departures": len(raw_departures),
            "normalized": len(all_normalized),
            "new": len(diff.new),
            "updated": len(diff.updated),
            "unchanged": len(diff.unchanged),
            "removed_from_api": len(diff.removed),
            "stale_marked": stale_marked,
            "upserted": upserted,
            "archived": archived,
        }

        # Log per-flight change details at debug level
        for detail in diff.change_details:
            logger.debug(
                "Flight change detail",
                flight=detail["flight_iata"],
                changes=detail["changes"],
            )

        db_stats = self.db.get_flight_stats()
        logger.info(
            "Poll cycle complete",
            **stats,
            db_status_counts=db_stats,
        )

        return stats
