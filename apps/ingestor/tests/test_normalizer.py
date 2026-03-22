"""Tests for flight data normalization and diff engine."""

from src.providers.aviationstack_provider import AviationStackProvider
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
        {"flight_iata": "AA100", "scheduled_departure": "2024-01-01T10:00:00", "status": "en_route"},
        {"flight_iata": "DL200", "scheduled_departure": "2024-01-01T11:00:00", "status": "scheduled"},
    ]
    current_db: list[dict] = []

    diff = compute_diff(incoming, current_db)
    assert len(diff["new"]) == 2
    assert len(diff["updated"]) == 0


def test_diff_engine_detects_changes():
    incoming = [
        {"flight_iata": "AA100", "scheduled_departure": "2024-01-01T10:00:00", "status": "landed", "latitude": None},
    ]
    current_db = [
        {"flight_iata": "AA100", "scheduled_departure": "2024-01-01T10:00:00", "status": "en_route", "latitude": 28.5},
    ]

    diff = compute_diff(incoming, current_db)
    assert len(diff["new"]) == 0
    assert len(diff["updated"]) == 1


def test_diff_engine_unchanged():
    flight = {"flight_iata": "AA100", "scheduled_departure": "2024-01-01T10:00:00", "status": "en_route", "latitude": 28.5}
    diff = compute_diff([flight], [flight])
    assert len(diff["unchanged"]) == 1
    assert len(diff["new"]) == 0
    assert len(diff["updated"]) == 0
