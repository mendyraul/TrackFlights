"""Flight data normalization — maps raw API responses to canonical schema."""

from typing import Any


def normalize_flight(raw: dict[str, Any], direction: str) -> dict[str, Any]:
    """Normalize a raw flight API response into the flights_current schema.

    This function handles the AviationStack API format.
    Adapt for other providers as needed.
    """
    flight_info = raw.get("flight", {})
    airline_info = raw.get("airline", {})
    departure_info = raw.get("departure", {})
    arrival_info = raw.get("arrival", {})
    aircraft_info = raw.get("aircraft", {})
    live_info = raw.get("live", {})

    return {
        "flight_iata": flight_info.get("iata", ""),
        "flight_icao": flight_info.get("icao"),
        "flight_number": flight_info.get("number"),
        "airline_iata": airline_info.get("iata"),
        "airline_name": airline_info.get("name"),
        "aircraft_icao": aircraft_info.get("icao"),
        "aircraft_registration": aircraft_info.get("registration"),
        "direction": direction,
        "origin_iata": departure_info.get("iata"),
        "origin_name": departure_info.get("airport"),
        "destination_iata": arrival_info.get("iata"),
        "destination_name": arrival_info.get("airport"),
        "scheduled_departure": departure_info.get("scheduled"),
        "actual_departure": departure_info.get("actual"),
        "scheduled_arrival": arrival_info.get("scheduled"),
        "actual_arrival": arrival_info.get("actual"),
        "estimated_arrival": arrival_info.get("estimated"),
        "status": _map_status(raw.get("flight_status", "unknown")),
        "delay_minutes": departure_info.get("delay") or arrival_info.get("delay") or 0,
        "latitude": live_info.get("latitude") if live_info else None,
        "longitude": live_info.get("longitude") if live_info else None,
        "altitude_ft": live_info.get("altitude") if live_info else None,
        "heading": live_info.get("direction") if live_info else None,
        "ground_speed_knots": live_info.get("speed_horizontal") if live_info else None,
        "vertical_speed_fpm": live_info.get("speed_vertical") if live_info else None,
        "departure_terminal": departure_info.get("terminal"),
        "departure_gate": departure_info.get("gate"),
        "arrival_terminal": arrival_info.get("terminal"),
        "arrival_gate": arrival_info.get("gate"),
        "baggage_belt": arrival_info.get("baggage"),
        "data_source": "aviationstack",
    }


def _map_status(raw_status: str) -> str:
    """Map API status strings to our flight_status enum."""
    mapping = {
        "scheduled": "scheduled",
        "active": "en_route",
        "en-route": "en_route",
        "landed": "landed",
        "arrived": "arrived",
        "departed": "departed",
        "cancelled": "cancelled",
        "diverted": "diverted",
        "delayed": "delayed",
    }
    return mapping.get(raw_status.lower(), "unknown")
