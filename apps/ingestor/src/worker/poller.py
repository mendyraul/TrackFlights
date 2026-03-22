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
        4. Diff to find new + updated flights
        5. Upsert changes into flights_current
        6. Archive old completed flights to flights_history
        7. Log statistics
    """

    def __init__(self, provider: BaseFlightProvider) -> None:
        self.provider = provider
        self.db = SupabaseFlightClient()

    async def execute(self) -> dict[str, int]:
        """Run one full poll cycle. Returns stats dict."""
        airport = settings.mia_iata_code

        # 1. Fetch from provider
        raw_arrivals = await self.provider.fetch_arrivals(airport)
        raw_departures = await self.provider.fetch_departures(airport)

        logger.info(
            "Fetched raw flights",
            provider=self.provider.name,
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

        # 5. Upsert new + updated
        to_upsert = diff["new"] + diff["updated"]
        upserted = self.db.upsert_flights(to_upsert)

        # 6. Archive old completed flights
        archived = self.db.archive_completed_flights()

        # 7. Stats
        stats = {
            "fetched_arrivals": len(raw_arrivals),
            "fetched_departures": len(raw_departures),
            "normalized": len(all_normalized),
            "new": len(diff["new"]),
            "updated": len(diff["updated"]),
            "unchanged": len(diff["unchanged"]),
            "upserted": upserted,
            "archived": archived,
        }

        db_stats = self.db.get_flight_stats()
        logger.info("Poll cycle complete", **stats, db_status_counts=db_stats)

        return stats
