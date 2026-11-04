from datetime import UTC, datetime
from unittest.mock import MagicMock

from src.services.observations import write_observations


def test_receiver_deduplicates_airframe_without_schedule_fields():
    client = MagicMock()
    flight = {
        "flight_iata": "AA123",
        "latitude": 25.9,
        "longitude": -80.3,
        "raw_data": {"hex": "abc123"},
        "observed_at": datetime.now(UTC).isoformat(),
    }
    write_observations(client, "adsb1090", [flight, {**flight, "flight_iata": "AA456"}])
    rows = client.table.return_value.upsert.call_args.args[0]
    assert len(rows) == 1
    assert rows[0]["aircraft_key"] == "abc123"
    assert rows[0]["payload"]["id"] == "adsb1090:abc123"
    assert rows[0]["payload"]["flight_iata"] == "AA456"
    assert rows[0]["payload"]["updated_at"] == flight["observed_at"]


def test_empty_provider_refresh_atomically_clears_previous_snapshot():
    client = MagicMock()
    write_observations(client, "flightaware", [])
    client.rpc.assert_called_once_with("replace_regional_observations", {"p_rows": []})


def test_invalid_coordinates_and_old_positions_are_rejected():
    client = MagicMock()
    write_observations(
        client,
        "adsb1090",
        [
            {"flight_iata": "x", "latitude": 999, "longitude": 0},
            {
                "flight_iata": "y",
                "latitude": 0,
                "longitude": 0,
                "observed_at": "2020-01-01T00:00:00Z",
            },
        ],
    )
    client.table.assert_not_called()
