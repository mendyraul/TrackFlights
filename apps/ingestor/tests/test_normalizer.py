"""Tests for flight data normalization."""

from src.models.flight import normalize_flight, _map_status


def test_normalize_arrival():
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

    result = normalize_flight(raw, "arrival")

    assert result["flight_iata"] == "AA100"
    assert result["direction"] == "arrival"
    assert result["status"] == "en_route"
    assert result["latitude"] == 28.5
    assert result["delay_minutes"] == 5
    assert result["airline_iata"] == "AA"


def test_map_status():
    assert _map_status("active") == "en_route"
    assert _map_status("scheduled") == "scheduled"
    assert _map_status("landed") == "landed"
    assert _map_status("cancelled") == "cancelled"
    assert _map_status("foobar") == "unknown"
