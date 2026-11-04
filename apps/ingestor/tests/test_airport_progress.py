from src.services.airport_progress import infer_progress


def point(time, lat, alt, vrate=-600, **extra):
    return {
        "time": time,
        "latitude": lat,
        "longitude": -80.287,
        "altitude_ft": alt,
        "vertical_speed_fpm": vrate,
        "heading": 180,
        **extra,
    }


def test_two_samples_required_for_approach():
    current = point(1000, 25.85, 1500)
    assert infer_progress(None, current, "MIA") is None
    assert infer_progress(point(980, 25.9, 1800), current, "MIA") == "Approaching"
    assert infer_progress(point(700, 25.9, 1800), current, "MIA") is None


def test_landing_requires_ground_after_approach():
    previous = point(980, 25.8, 0, approach_at=900)
    current = point(1000, 25.796, 0)
    assert infer_progress(previous, current, "MIA") == "Likely landed"
    assert infer_progress(point(980, 25.8, 0), current, "MIA") == "Observed near airport"
    assert infer_progress(point(980, 25.9, 1000), current, "MIA") is None


def test_departure_requires_ground_to_climb():
    assert infer_progress(point(980, 25.796, 0), point(1000, 25.82, 500, 700), "MIA") == "Departing"
    assert infer_progress(point(980, 25.796, 500), point(1000, 25.82, 800, 700), "MIA") is None


def test_neighboring_airport_ground_does_not_land_at_mia():
    assert (
        infer_progress(point(980, 25.907, 0, approach_at=900), point(1000, 25.907, 0), "MIA")
        is None
    )


def test_matched_progress_preserves_official_status_and_ignores_provider_positions(monkeypatch):
    from datetime import UTC, datetime
    from unittest.mock import MagicMock

    from src.services import airport_progress

    monkeypatch.setattr(airport_progress.time, "time", lambda: 10020)
    flight = {
        "id": "leg1",
        "flight_icao": "AAL123",
        "destination_iata": "MIA",
        "scheduled_arrival": datetime.fromtimestamp(10000, UTC).isoformat(),
        "status": "scheduled",
    }
    client = MagicMock()
    client.table.return_value.select.return_value.gte.return_value.execute.return_value.data = [
        {
            "airport": "MIA",
            "service_date": "1970-01-01",
            "board": "scheduled_arrivals",
            "flights": [flight],
        }
    ]
    engine = airport_progress.AirportProgress(client)

    def observation(stamp, lat, source="adsb1090"):
        return {
            **point(stamp, lat, 1500),
            "flight_iata": "AA123",
            "data_source": source,
            "raw_data": {"hex": "ABC123"},
            "observed_at": datetime.fromtimestamp(stamp, UTC).isoformat(),
        }

    engine.record([observation(10000, 25.9, "flightaware")])
    assert not engine.previous
    engine.record([observation(10000, 25.9)])
    engine.record([observation(10020, 25.85)])
    row = client.table.return_value.upsert.call_args.args[0]
    assert row["state"] == "Approaching"
    assert row["flight_key"] == "leg1"
    assert "status" not in row
    assert flight["status"] == "scheduled"


def test_ambiguous_reused_callsigns_do_not_generate_progress(monkeypatch):
    from datetime import UTC, datetime
    from unittest.mock import MagicMock

    from src.services import airport_progress

    monkeypatch.setattr(airport_progress.time, "time", lambda: 10020)
    flight = {
        "id": "one",
        "flight_iata": "AA123",
        "destination_iata": "MIA",
        "scheduled_arrival": datetime.fromtimestamp(10000, UTC).isoformat(),
    }
    client = MagicMock()
    client.table.return_value.select.return_value.gte.return_value.execute.return_value.data = [
        {
            "airport": "MIA",
            "service_date": "1970-01-01",
            "board": "scheduled_arrivals",
            "flights": [flight, {**flight, "id": "two"}],
        }
    ]
    engine = airport_progress.AirportProgress(client)
    engine.record(
        [
            {
                **point(10000, 25.9, 1500),
                "flight_iata": "AA123",
                "data_source": "adsb1090",
                "observed_at": datetime.fromtimestamp(10000, UTC).isoformat(),
            }
        ]
    )
    assert not engine.previous
    client.table.return_value.upsert.assert_not_called()
