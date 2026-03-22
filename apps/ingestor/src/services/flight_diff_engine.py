"""Diff engine: compare normalized flights against current DB state."""

from typing import Any

import structlog

logger = structlog.get_logger()

# Fields that trigger an upsert when changed
TRACKED_FIELDS = [
    "status",
    "delay_minutes",
    "latitude",
    "longitude",
    "altitude_ft",
    "heading",
    "ground_speed_knots",
    "vertical_speed_fpm",
    "actual_departure",
    "actual_arrival",
    "estimated_arrival",
    "arrival_gate",
    "departure_gate",
    "baggage_belt",
    "arrival_terminal",
    "departure_terminal",
]


def compute_diff(
    incoming: list[dict[str, Any]],
    current_db: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    """Compare incoming normalized flights against current DB rows.

    Returns:
        {
            "new": [...],       # Flights not in DB yet
            "updated": [...],   # Flights with changed tracked fields
            "unchanged": [...], # Flights with no changes
        }
    """
    current_map: dict[str, dict[str, Any]] = {}
    for row in current_db:
        key = _flight_key(row)
        current_map[key] = row

    result: dict[str, list[dict[str, Any]]] = {
        "new": [],
        "updated": [],
        "unchanged": [],
    }

    for flight in incoming:
        key = _flight_key(flight)
        existing = current_map.get(key)

        if existing is None:
            result["new"].append(flight)
        elif _has_changes(flight, existing):
            result["updated"].append(flight)
        else:
            result["unchanged"].append(flight)

    logger.info(
        "Diff computed",
        new=len(result["new"]),
        updated=len(result["updated"]),
        unchanged=len(result["unchanged"]),
    )

    return result


def _flight_key(flight: dict[str, Any]) -> str:
    """Generate a unique key for diffing."""
    return f"{flight.get('flight_iata', '')}|{flight.get('scheduled_departure', '')}"


def _has_changes(new: dict[str, Any], old: dict[str, Any]) -> bool:
    """Check if any tracked field has changed."""
    return any(new.get(f) != old.get(f) for f in TRACKED_FIELDS)
