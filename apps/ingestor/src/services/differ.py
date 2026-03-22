"""Diff logic: compare normalized flights against current DB state."""

from typing import Any


def compute_upserts(
    normalized: list[dict[str, Any]],
    current: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return flights that are new or have changed fields."""
    current_map: dict[str, dict[str, Any]] = {}
    for flight in current:
        key = f"{flight['flight_iata']}|{flight.get('scheduled_departure', '')}"
        current_map[key] = flight

    to_upsert: list[dict[str, Any]] = []

    for flight in normalized:
        key = f"{flight['flight_iata']}|{flight.get('scheduled_departure', '')}"
        existing = current_map.get(key)

        if existing is None:
            # New flight
            to_upsert.append(flight)
        elif _has_changes(flight, existing):
            # Updated flight
            to_upsert.append(flight)

    return to_upsert


def _has_changes(new: dict[str, Any], old: dict[str, Any]) -> bool:
    """Check if any tracked fields have changed."""
    tracked_fields = [
        "status",
        "delay_minutes",
        "latitude",
        "longitude",
        "altitude_ft",
        "heading",
        "ground_speed_knots",
        "actual_departure",
        "actual_arrival",
        "estimated_arrival",
        "arrival_gate",
        "departure_gate",
        "baggage_belt",
    ]
    return any(new.get(f) != old.get(f) for f in tracked_fields)
