"""Main entry point for the MIA flight data ingestor."""

import asyncio
import signal

import structlog

from src.config import (
    get_runtime_config_summary,
    settings,
    validate_runtime_settings,
)
from src.providers.adsb1090_provider import Adsb1090Provider
from src.providers.aviationstack_provider import AviationStackProvider
from src.providers.base_provider import BaseFlightProvider
from src.providers.example_provider import ExampleProvider
from src.services.supabase_client import SupabaseFlightClient
from src.worker.poller import Poller
from src.worker.position_streamer import PositionStreamer

logger = structlog.get_logger()

PROVIDERS: dict[str, type[BaseFlightProvider]] = {
    "aviationstack": AviationStackProvider,
    "example": ExampleProvider,
    "adsb1090": Adsb1090Provider,
}


def get_provider() -> BaseFlightProvider:
    """Instantiate the configured flight data provider."""
    name = settings.flight_provider
    cls = PROVIDERS.get(name)
    if cls is None:
        raise ValueError(f"Unknown provider '{name}'. Available: {list(PROVIDERS.keys())}")
    return cls()


def _install_signal_handlers(shutdown: asyncio.Event) -> None:
    def handle_signal(sig: int, _frame: object) -> None:
        logger.info("Received shutdown signal", signal=sig)
        shutdown.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)


async def _run_stream() -> None:
    """Positions-model streaming ETL (tracked_flights + flight_positions)."""
    provider = get_provider()
    db = SupabaseFlightClient()
    streamer = PositionStreamer(provider, db)

    logger.info(
        "Starting TrackFlights edge (stream mode)",
        provider=provider.name,
        station_id=settings.station_id,
        throttle_s=settings.position_throttle_seconds,
        flush_s=settings.flush_interval_seconds,
    )

    shutdown = asyncio.Event()
    _install_signal_handlers(shutdown)
    await streamer.run(shutdown)


async def _run_poller() -> None:
    """Legacy diff-based flights_current ingestion (kept for back-compat)."""
    provider = get_provider()
    poller = Poller(provider)

    logger.info(
        "Starting TrackFlights edge (poller mode)",
        provider=provider.name,
        poll_interval=settings.poll_interval_seconds,
        airport=settings.mia_iata_code,
    )

    shutdown = asyncio.Event()
    _install_signal_handlers(shutdown)

    while not shutdown.is_set():
        try:
            stats = await poller.execute()
            logger.info("Cycle stats", **stats)
        except Exception:
            logger.exception("Error during poll cycle")

        try:
            await asyncio.wait_for(shutdown.wait(), timeout=settings.poll_interval_seconds)
        except TimeoutError:
            pass  # Normal: time to poll again

    logger.info("Ingestor shutdown complete")


async def main() -> None:
    """Validate config and run the configured ingestion mode."""
    validate_runtime_settings()
    logger.info("Runtime config validated", **get_runtime_config_summary())

    if settings.ingest_mode == "stream":
        await _run_stream()
    else:
        await _run_poller()


if __name__ == "__main__":
    asyncio.run(main())
