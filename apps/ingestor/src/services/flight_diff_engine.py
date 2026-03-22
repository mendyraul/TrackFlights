"""Diff engine: compare normalized flights against current DB state.

Produces minimal upserts and detects removed flights.
"""

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


class DiffResult:
    """Result of a diff operation with detailed change tracking."""

    def __init__(self) -> None:
        self.new: list[dict[str, Any]] = []
        self.updated: list[dict[str, Any]] = []
        self.unchanged: list[dict[str, Any]] = []
        self.removed: list[dict[str, Any]] = []  # In DB but not in API response
        self.change_details: list[dict[str, Any]] = []  # Per-flight change log

    @property
    def to_upsert(self) -> list[dict[str, Any]]:
        return self.new + self.updated

    def summary(self) -> dict[str, int]:
        return {
            "new": len(self.new),
            "updated": len(self.updated),
            "unchanged": len(self.unchanged),
            "removed": len(self.removed),
        }


def compute_diff(
    incoming: list[dict[str, Any]],
    current_db: list[dict[str, Any]],
) -> DiffResult:
    """Compare incoming normalized flights against current DB rows.

    Also detects flights present in DB but missing from the API response
    (removed / no longer active).
    """
    result = DiffResult()

    # Build lookup from current DB
    current_map: dict[str, dict[str, Any]] = {}
    for row in current_db:
        key = _flight_key(row)
        current_map[key] = row

    # Track which DB rows were seen in the incoming data
    seen_keys: set[str] = set()

    # Deduplicate incoming by key (keep last occurrence)
    deduped: dict[str, dict[str, Any]] = {}
    for flight in incoming:
        key = _flight_key(flight)
        deduped[key] = flight

    for key, flight in deduped.items():
        seen_keys.add(key)
        existing = current_map.get(key)

        if existing is None:
            result.new.append(flight)
            logger.info(
                "New flight detected",
                flight=flight.get("flight_iata"),
                direction=flight.get("direction"),
                status=flight.get("status"),
            )
        else:
            changed_fields = _get_changed_fields(flight, existing)
            if changed_fields:
                result.updated.append(flight)
                result.change_details.append(
                    {
                        "flight_iata": flight.get("flight_iata"),
                        "changes": changed_fields,
                    }
                )
                logger.info(
                    "Flight updated",
                    flight=flight.get("flight_iata"),
                    changed_fields=list(changed_fields.keys()),
                )
            else:
                result.unchanged.append(flight)

    # Detect flights removed from API (still in DB but not in incoming)
    for key, db_row in current_map.items():
        if key not in seen_keys:
            result.removed.append(db_row)
            logger.info(
                "Flight no longer in API",
                flight=db_row.get("flight_iata"),
                status=db_row.get("status"),
            )

    logger.info("Diff computed", **result.summary())
    return result


def _flight_key(flight: dict[str, Any]) -> str:
    """Generate a unique key for diffing."""
    return f"{flight.get('flight_iata', '')}|{flight.get('scheduled_departure', '')}"


def _get_changed_fields(
    new: dict[str, Any], old: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """Return dict of changed fields with old and new values.

    Only checks tracked fields. Returns empty dict if nothing changed.
    """
    changes: dict[str, dict[str, Any]] = {}
    for field in TRACKED_FIELDS:
        new_val = new.get(field)
        old_val = old.get(field)
        if new_val != old_val:
            changes[field] = {"old": old_val, "new": new_val}
    return changes
