"""Phase inference, hourly traffic stats, and receiver telemetry."""

import asyncio
from datetime import UTC, datetime

from src.providers.adsb1090_provider import MIA_LAT, MIA_LON, Adsb1090Provider
from src.services.phase import KMIA_LAT, KMIA_LON, bearing_deg, distance_km, infer_phase
from src.services.traffic_stats import TrafficAccumulator

# ~30 km due east of MIA, over the ocean (same fixture as the web tests).
EAST = (25.79325, -79.99)


def test_geometry():
    assert round(distance_km(KMIA_LAT, KMIA_LON, *EAST)) == 30
    assert round(bearing_deg(*EAST, KMIA_LAT, KMIA_LON)) == 270


def test_phase_matches_web_cases():
    # Descending toward MIA => arriving.
    assert infer_phase(*EAST, 6000, -1200, 270) == "arriving"
    # Descending on a downwind leg (flying away) in the terminal area => arriving.
    assert infer_phase(*EAST, 5000, -1700, 90) == "arriving"
    # Climbing away => departing.
    assert infer_phase(*EAST, 8000, 2000, 90) == "departing"
    # Climbing but pointed at MIA (another field's departure) => not a MIA departure.
    assert infer_phase(*EAST, 3000, 1500, 270) == "overflight"
    # Cruise over Miami => overflight, not "departure" as vertical rate alone said.
    assert infer_phase(KMIA_LAT, KMIA_LON + 0.05, 35000, 0, 180) == "overflight"
    # Holding: level in the terminal area.
    assert infer_phase(*EAST, 7000, 0, 0) == "overflight"
    # Level final approach.
    assert infer_phase(KMIA_LAT, KMIA_LON + 0.1, 1500, -100, 270) == "arriving"
    assert infer_phase(*EAST, 0, 0, 90, on_ground=True) == "on-ground"
    assert infer_phase(None, None, 5000, 0, 0) == "unknown"


def test_accumulator_counts_each_aircraft_once_per_hour():
    acc = TrafficAccumulator()
    t1 = datetime(2026, 10, 20, 14, 5, tzinfo=UTC)
    t2 = datetime(2026, 10, 20, 14, 6, tzinfo=UTC)
    acc.add_poll(
        [
            {"hex": "A1", "phase": "arriving", "distance_km": 40.0},
            {"hex": "A2", "phase": "overflight", "distance_km": 180.0},
        ],
        now=t1,
    )
    hour = acc.add_poll([{"hex": "A1", "phase": "on-ground", "distance_km": 1.0}], now=t2)

    params = hour.to_rpc_params()
    assert params["p_hour"] == "2026-10-20T14:00:00+00:00"
    assert params["p_unique_aircraft"] == 2
    # A1 counts once, in the phase it was last seen in.
    assert params["p_on_ground"] == 1 and params["p_arriving"] == 0
    assert params["p_overflights"] == 1
    assert params["p_peak_concurrent"] == 2
    assert params["p_max_range_km"] == 180.0
    assert params["p_polls"] == 2


def test_accumulator_rolls_over_on_the_hour():
    acc = TrafficAccumulator()
    acc.add_poll(
        [{"hex": "A1", "phase": "arriving", "distance_km": 5.0}],
        now=datetime(2026, 10, 20, 14, 59, tzinfo=UTC),
    )
    hour = acc.add_poll([], now=datetime(2026, 10, 20, 15, 0, 5, tzinfo=UTC))
    assert hour.to_rpc_params()["p_unique_aircraft"] == 0
    assert hour.polls == 1


def _provider() -> Adsb1090Provider:
    p = Adsb1090Provider.__new__(Adsb1090Provider)
    p.json_url = "http://test/aircraft.json"
    p.max_range_km = 200.0
    p.min_move_meters = 150.0
    p.max_seen_seconds = 60.0
    p._last_emitted = {}
    p.last_poll = {"received": 0, "observations": []}
    return p


def test_last_poll_sees_aircraft_the_movement_gate_drops(monkeypatch):
    provider = _provider()

    async def feed():
        return [
            {"hex": "~abc", "lat": MIA_LAT, "lon": MIA_LON, "alt_baro": "ground", "seen_pos": 1},
            {"hex": "far", "lat": MIA_LAT + 5, "lon": MIA_LON, "seen_pos": 1},
        ]

    monkeypatch.setattr(provider, "_read_feed", feed)
    asyncio.run(provider.fetch_live_positions("MIA"))
    # Second poll: the parked aircraft hasn't moved, so nothing is emitted...
    assert asyncio.run(provider.fetch_live_positions("MIA")) == []
    # ...but it is still observed for stats and the heartbeat.
    assert provider.last_poll["received"] == 2
    assert [(o["hex"], o["phase"]) for o in provider.last_poll["observations"]] == [
        ("ABC", "on-ground")
    ]


def test_normalize_overflight_is_not_an_arrival():
    provider = _provider()
    row = provider.normalize(
        {
            "hex": "c0ffee",
            "flight": "UAL1",
            "lat": MIA_LAT,
            "lon": MIA_LON + 0.05,
            "alt_baro": 36000,
            "baro_rate": -64,
            "track": 180,
        },
        "live",
    )
    # Vertical rate alone (< -64) would have called this cruise an arrival.
    assert row["direction"] == "departure"


class _FakeDb:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.heartbeats: list[dict] = []
        self.hours: list[dict] = []

    def record_heartbeat(self, **kwargs):
        if self.fail:
            raise RuntimeError('relation "ingestor_heartbeat" does not exist')
        self.heartbeats.append(kwargs)

    def record_traffic_hour(self, params):
        self.hours.append(params)


def _poller_with(db, provider):
    from src.worker.poller import Poller

    poller = Poller.__new__(Poller)
    poller.provider = provider
    poller.db = db
    poller._traffic = TrafficAccumulator()
    poller._telemetry_warned = False
    poller._last_ping = 0.0
    return poller


def test_poller_writes_heartbeat_and_traffic():
    provider = _provider()
    provider.last_poll = {
        "received": 7,
        "observations": [{"hex": "A1", "phase": "arriving", "distance_km": 12.0}],
    }
    db = _FakeDb()
    _poller_with(db, provider)._record_receiver_telemetry({"upserted": 1})

    assert db.heartbeats == [
        {"source": "adsb1090", "received": 7, "in_range": 1, "rows_written": 1}
    ]
    assert db.hours[0]["p_unique_aircraft"] == 1


def test_telemetry_failure_never_breaks_ingestion():
    provider = _provider()
    poller = _poller_with(_FakeDb(fail=True), provider)
    # Missing migration: logs once, does not raise.
    poller._record_receiver_telemetry({"upserted": 0})
    poller._record_receiver_telemetry({"upserted": 0})
    assert poller._telemetry_warned is True


def test_ping_only_when_the_radio_hears_aircraft(monkeypatch):
    from src.config import settings
    from src.worker import poller as poller_module

    pings: list[str] = []
    monkeypatch.setattr(settings, "heartbeat_ping_url", "https://hc-ping.example/abc")
    monkeypatch.setattr(poller_module.httpx, "get", lambda url, timeout: pings.append(url))

    provider = _provider()
    poller = _poller_with(_FakeDb(), provider)

    provider.last_poll = {"received": 0, "observations": []}
    poller._record_receiver_telemetry({})
    assert pings == []  # silent radio => no ping => monitor alerts

    provider.last_poll = {"received": 3, "observations": []}
    poller._record_receiver_telemetry({})
    poller._record_receiver_telemetry({})  # throttled to once a minute
    assert pings == ["https://hc-ping.example/abc"]
