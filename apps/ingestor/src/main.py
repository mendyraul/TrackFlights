"""Main entry point for the MIA flight data ingestor."""

import asyncio
import signal
import sys

import structlog

from src.config import settings
from src.services.ingestor import FlightIngestor

logger = structlog.get_logger()


async def main() -> None:
    """Run the ingestion loop."""
    logger.info(
        "Starting MIA Flight Ingestor",
        poll_interval=settings.poll_interval_seconds,
        airport=settings.mia_iata_code,
    )

    ingestor = FlightIngestor()
    shutdown = asyncio.Event()

    def handle_signal(sig: int, _frame: object) -> None:
        logger.info("Received shutdown signal", signal=sig)
        shutdown.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    while not shutdown.is_set():
        try:
            await ingestor.poll_and_upsert()
        except Exception:
            logger.exception("Error during poll cycle")

        try:
            await asyncio.wait_for(shutdown.wait(), timeout=settings.poll_interval_seconds)
        except asyncio.TimeoutError:
            pass  # Normal: timeout means time to poll again

    logger.info("Ingestor shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
