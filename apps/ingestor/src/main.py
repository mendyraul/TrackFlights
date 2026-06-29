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
from src.providers.flightaware_provider import FlightAwareProvider
from src.worker.poller import Poller

logger = structlog.get_logger()

PROVIDERS: dict[str, type[BaseFlightProvider]] = {
    "aviationstack": AviationStackProvider,
    "flightaware": FlightAwareProvider,
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


async def main() -> None:
    """Run the ingestion loop."""
    validate_runtime_settings()

    provider = get_provider()
    poller = Poller(provider)

    logger.info("Runtime config validated", **get_runtime_config_summary())
    logger.info(
        "Starting MIA Flight Ingestor",
        provider=provider.name,
        poll_interval=settings.poll_interval_seconds,
        airport=settings.mia_iata_code,
    )

    shutdown = asyncio.Event()

    def handle_signal(sig: int, _frame: object) -> None:
        logger.info("Received shutdown signal", signal=sig)
        shutdown.set()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

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


if __name__ == "__main__":
    asyncio.run(main())
