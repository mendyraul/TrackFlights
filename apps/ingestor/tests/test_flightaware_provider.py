"""Tests for the FlightAware AeroAPI provider."""

from src.providers.flightaware_provider import FlightAwareProvider


def test_extract_board_accepts_primary_key():
    flights = [{"ident": "AAL1"}]
    assert FlightAwareProvider._extract_board({"arrivals": flights}, "arrivals") == flights


def test_extract_board_accepts_scheduled_fallback_key():
    flights = [{"ident": "DAL2"}]
    assert (
        FlightAwareProvider._extract_board({"scheduled_departures": flights}, "departures")
        == flights
    )


def test_delay_minutes_uses_explicit_provider_field():
    provider = FlightAwareProvider.__new__(FlightAwareProvider)
    result = provider.normalize(
        {
            "ident": "UAL77",
            "status": "Delayed",
            "arrival_delay": 22,
            "origin": {"iata": "ORD"},
            "destination": {"iata": "MIA"},
        },
        "arrival",
    )

    assert result["delay_minutes"] == 22
    assert result["status"] == "delayed"
