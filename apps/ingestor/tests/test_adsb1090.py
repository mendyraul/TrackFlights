"""Tests for the self-hosted ADS-B (1090 MHz) provider."""

import asyncio

from src.providers.adsb1090_provider import MIA_LAT, MIA_LON, Adsb1090Provider


def _make_provider(**overrides) -> Adsb1090Provider:
    """Build a provider without touching settings/env."""
    p = Adsb1090Provider.__new__(Adsb1090Provider)
    p.json_url = "http://test/aircraft.json"
    p.max_range_km = overrides.get("max_range_km", 200.0)
    p.min_move_meters = overrides.get("min_move_meters", 150.0)
    p.max_seen_seconds = overrides.get("max_seen_seconds", 60.0)
    p._last_emitted = {}
    return p


def test_normalize_airborne_arrival():
    provider = _make_provider()
    raw = {
        "hex": "a1b2c3",
        "flight": "AAL100  ",
        "lat": 25.9,
        "lon": -80.3,
        "alt_baro": 4000,
        "baro_rate": -1200,  # descending => arrival
        "track": 270,
        "gs": 240,
        "t": "B738",
        "r": "N123AA",
    }

    result = provider.normalize(raw, "live")

    # ICAO callsign converts to the IATA ident so ADS-B contacts share a row
    # with schedule-feed data.
    assert result["flight_iata"] == "AA100"
    assert result["direction"] == "arrival"
    assert result["status"] == "en_route"
    assert result["altitude_ft"] == 4000
    assert result["heading"] == 270
    assert result["ground_speed_knots"] == 240
    assert result["aircraft_icao"] == "B738"
    assert result["aircraft_registration"] == "N123AA"
    assert result["data_source"] == "adsb1090"


def test_normalize_departure_and_ground():
    provider = _make_provider()
    climbing = provider.normalize(
        {
            "hex": "abc",
            "flight": "DAL55",
            "lat": 25.8,
            "lon": -80.3,
            "alt_baro": 8000,
            "baro_rate": 1800,
        },
        "live",
    )
    assert climbing["direction"] == "departure"

    on_ground = provider.normalize(
        {"hex": "def", "lat": 25.79, "lon": -80.29, "alt_baro": "ground"},
        "live",
    )
    # No callsign => falls back to the hex id; on-ground => landed at 0 ft.
    assert on_ground["flight_iata"] == "DEF"
    assert on_ground["status"] == "landed"
    assert on_ground["altitude_ft"] == 0


def test_fetch_live_positions_filters_range_and_freshness(monkeypatch):
    provider = _make_provider(max_range_km=100.0, max_seen_seconds=30.0)

    feed = [
        {"hex": "in1", "lat": MIA_LAT + 0.1, "lon": MIA_LON, "seen_pos": 2},  # in range, fresh
        {"hex": "far", "lat": MIA_LAT + 5.0, "lon": MIA_LON, "seen_pos": 2},  # >100km away
        {"hex": "old", "lat": MIA_LAT, "lon": MIA_LON, "seen_pos": 120},  # stale
        {"hex": "nopos", "seen_pos": 1},  # no fix
    ]

    async def fake_read():
        return feed

    monkeypatch.setattr(provider, "_read_feed", fake_read)
    kept = asyncio.run(provider.fetch_live_positions("MIA"))

    assert [ac["hex"] for ac in kept] == ["in1"]


def test_fetch_live_positions_movement_gate(monkeypatch):
    provider = _make_provider(min_move_meters=150.0)

    def set_feed_at(lat, lon):
        async def fake_read():
            return [{"hex": "mv1", "lat": lat, "lon": lon, "seen_pos": 1}]

        monkeypatch.setattr(provider, "_read_feed", fake_read)

    # First snapshot: always emitted.
    set_feed_at(MIA_LAT, MIA_LON)
    assert len(asyncio.run(provider.fetch_live_positions("MIA"))) == 1

    # Barely moved (~1m) => gated out.
    set_feed_at(MIA_LAT + 0.00001, MIA_LON)
    assert asyncio.run(provider.fetch_live_positions("MIA")) == []

    # Moved well past the threshold (~1.1km) => emitted again.
    set_feed_at(MIA_LAT + 0.01, MIA_LON)
    assert len(asyncio.run(provider.fetch_live_positions("MIA"))) == 1
