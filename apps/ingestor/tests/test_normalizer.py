"""Tests for flight data normalization and diff engine."""

from src.providers.aviationstack_provider import AviationStackProvider
from src.providers.flightaware_provider import FlightAwareProvider
from src.services.flight_diff_engine import compute_diff


def test_aviationstack_normalize_arrival():
    provider = AviationStackProvider.__new__(AviationStackProvider)
    raw = {
        "flight_status": "active",
        "flight": {"iata": "AA100", "icao": "AAL100", "number": "100"},
        "airline": {"iata": "AA", "name": "American Airlines"},
        "departure": {
            "iata": "JFK",
            "airport": "John F. Kennedy International",
            "scheduled": "2024-01-01T10:00:00+00:00",
            "actual": "2024-01-01T10:05:00+00:00",
            "terminal": "8",
            "gate": "B22",
            "delay": 5,
        },
        "arrival": {
            "iata": "MIA",
            "airport": "Miami International",
            "scheduled": "2024-01-01T13:30:00+00:00",
            "estimated": "2024-01-01T13:35:00+00:00",
            "terminal": "N",
            "gate": "D40",
        },
        "aircraft": {"icao": "B738", "registration": "N123AA"},
        "live": {
            "latitude": 28.5,
            "longitude": -79.2,
            "altitude": 35000,
            "direction": 180,
            "speed_horizontal": 450,
            "speed_vertical": -10,
        },
    }

    result = provider.normalize(raw, "arrival")

    assert result["flight_iata"] == "AA100"
    assert result["direction"] == "arrival"
    assert result["status"] == "en_route"
    assert result["latitude"] == 28.5
    assert result["delay_minutes"] == 5
    assert result["airline_iata"] == "AA"
    assert result["data_source"] == "aviationstack"
    assert result["altitude_ft"] == 35000
    assert result["heading"] == 180


def test_diff_engine_new_flights():
    incoming = [
        {
            "flight_iata": "AA100",
            "scheduled_departure": "2024-01-01T10:00:00",
            "status": "en_route",
        },
        {
            "flight_iata": "DL200",
            "scheduled_departure": "2024-01-01T11:00:00",
            "status": "scheduled",
        },
    ]

    diff = compute_diff(incoming, [])
    assert len(diff.new) == 2
    assert len(diff.updated) == 0
    assert len(diff.removed) == 0


def test_flightaware_normalize_departure():
    provider = FlightAwareProvider.__new__(FlightAwareProvider)
    raw = {
        "ident_iata": "AA123",
        "ident_icao": "AAL123",
        "operator_iata": "AA",
        "operator": "American Airlines",
        "aircraft_type": "B738",
        "registration": "N123AA",
        "origin": {"code_iata": "MIA", "name": "Miami International"},
        "destination": {"code_iata": "JFK", "name": "John F. Kennedy International"},
        "scheduled_out": "2026-06-29T14:00:00Z",
        "actual_out": "2026-06-29T14:12:00Z",
        "scheduled_in": "2026-06-29T17:05:00Z",
        "estimated_in": "2026-06-29T17:21:00Z",
        "status": "En Route",
        "terminal_origin": "D",
        "gate_origin": "D32",
        "terminal_destination": "8",
        "gate_destination": "31",
        "baggage_claim": "4",
        "last_position": {
            "latitude": 27.8,
            "longitude": -79.9,
            "altitude": 36000,
            "heading": 28,
            "groundspeed": 451,
            "vertical_speed": 0,
        },
    }

    result = provider.normalize(raw, "departure")

    assert result["flight_iata"] == "AA123"
    assert result["flight_icao"] == "AAL123"
    assert result["flight_number"] == "123"
    assert result["direction"] == "departure"
    assert result["status"] == "en_route"
    assert result["delay_minutes"] == 16
    assert result["origin_iata"] == "MIA"
    assert result["destination_iata"] == "JFK"
    assert result["departure_gate"] == "D32"
    assert result["arrival_gate"] == "31"
    assert result["ground_speed_knots"] == 451
    assert result["data_source"] == "flightaware"


def test_diff_engine_detects_changes():
    incoming = [
        {
            "flight_iata": "AA100",
            "scheduled_departure": "2024-01-01T10:00:00",
            "status": "landed",
            "latitude": None,
        },
    ]
    current_db = [
        {
            "flight_iata": "AA100",
            "scheduled_departure": "2024-01-01T10:00:00",
            "status": "en_route",
            "latitude": 28.5,
        },
    ]

    diff = compute_diff(incoming, current_db)
    assert len(diff.new) == 0
    assert len(diff.updated) == 1
    assert len(diff.change_details) == 1
    assert "status" in diff.change_details[0]["changes"]
    assert diff.change_details[0]["changes"]["status"]["old"] == "en_route"
    assert diff.change_details[0]["changes"]["status"]["new"] == "landed"


def test_diff_engine_unchanged():
    flight = {
        "flight_iata": "AA100",
        "scheduled_departure": "2024-01-01T10:00:00",
        "status": "en_route",
        "latitude": 28.5,
    }
    diff = compute_diff([flight], [flight])
    assert len(diff.unchanged) == 1
    assert len(diff.new) == 0
    assert len(diff.updated) == 0


def test_diff_engine_detects_removed():
    incoming = [
        {
            "flight_iata": "AA100",
            "scheduled_departure": "2024-01-01T10:00:00",
            "status": "en_route",
        },
    ]
    current_db = [
        {
            "flight_iata": "AA100",
            "scheduled_departure": "2024-01-01T10:00:00",
            "status": "en_route",
        },
        {"flight_iata": "DL200", "scheduled_departure": "2024-01-01T11:00:00", "status": "landed"},
    ]

    diff = compute_diff(incoming, current_db)
    assert len(diff.removed) == 1
    assert diff.removed[0]["flight_iata"] == "DL200"


def test_diff_engine_deduplicates_incoming():
    """When incoming has duplicate keys, keep the last occurrence."""
    incoming = [
        {
            "flight_iata": "AA100",
            "scheduled_departure": "2024-01-01T10:00:00",
            "status": "en_route",
        },
        {"flight_iata": "AA100", "scheduled_departure": "2024-01-01T10:00:00", "status": "landed"},
    ]

    diff = compute_diff(incoming, [])
    assert len(diff.new) == 1
    assert diff.new[0]["status"] == "landed"  # Last one wins


def test_to_upsert_combines_new_and_updated():
    incoming = [
        {"flight_iata": "AA100", "scheduled_departure": "2024-01-01T10:00:00", "status": "landed"},
        {
            "flight_iata": "DL200",
            "scheduled_departure": "2024-01-01T11:00:00",
            "status": "scheduled",
        },
    ]
    current_db = [
        {
            "flight_iata": "AA100",
            "scheduled_departure": "2024-01-01T10:00:00",
            "status": "en_route",
        },
    ]

    diff = compute_diff(incoming, current_db)
    assert len(diff.to_upsert) == 2  # 1 updated + 1 new
