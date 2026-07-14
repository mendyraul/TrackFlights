"""Flight normalization service — orchestrates provider.normalize() calls."""

from typing import Any

import structlog

from src.providers.base_provider import BaseFlightProvider

logger = structlog.get_logger()


def normalize_batch(
    provider: BaseFlightProvider,
    raw_flights: list[dict[str, Any]],
    direction: str,
) -> list[dict[str, Any]]:
    """Normalize a batch of raw flights from a provider.

    Skips flights that fail normalization and logs warnings.
    """
    normalized: list[dict[str, Any]] = []

    for raw in raw_flights:
        try:
            record = provider.normalize(raw, direction)
            if not record.get("flight_iata"):
                logger.warning("Skipping flight with no IATA code", raw=raw)
                continue
            normalized.append(record)
        except Exception:
            logger.exception("Failed to normalize flight", raw=raw)

    return normalized
