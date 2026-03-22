"""Core ingestion logic: poll API, normalize, diff, upsert."""

import structlog
from supabase import create_client, Client

from src.config import settings
from src.api.flight_api import FlightAPIClient
from src.models.flight import normalize_flight
from src.services.differ import compute_upserts

logger = structlog.get_logger()


class FlightIngestor:
    def __init__(self) -> None:
        self.supabase: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        self.api_client = FlightAPIClient()

    async def poll_and_upsert(self) -> None:
        """Single poll cycle: fetch, normalize, diff, upsert."""
        logger.info("Starting poll cycle")

        # Fetch arrivals and departures
        raw_arrivals = await self.api_client.fetch_flights("arrival")
        raw_departures = await self.api_client.fetch_flights("departure")

        logger.info(
            "Fetched flights",
            arrivals=len(raw_arrivals),
            departures=len(raw_departures),
        )

        # Normalize
        normalized = []
        for flight in raw_arrivals:
            normalized.append(normalize_flight(flight, "arrival"))
        for flight in raw_departures:
            normalized.append(normalize_flight(flight, "departure"))

        # Get current state from DB
        result = self.supabase.table("flights_current").select("*").execute()
        current_flights = result.data or []

        # Compute diffs
        to_upsert = compute_upserts(normalized, current_flights)

        if to_upsert:
            logger.info("Upserting flights", count=len(to_upsert))
            self.supabase.table("flights_current").upsert(
                to_upsert,
                on_conflict="flight_iata,scheduled_departure",
            ).execute()

        logger.info("Poll cycle complete", upserted=len(to_upsert))
