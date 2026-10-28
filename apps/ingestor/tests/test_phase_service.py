"""Learned phase on the Pi: history, ground handling, provider integration."""

import asyncio

from src.ml.model_json import FORMAT, JsonModel
from src.ml.phase_features import FEATURES
from src.ml.phase_service import PhaseClassifier
from src.providers.adsb1090_provider import MIA_LAT, MIA_LON, Adsb1090Provider

CLASSES = ["arrival_mia", "departure_mia", "other_airport", "overflight"]


def model_by_alt_change() -> JsonModel:
    """Descending over the last minute -> arrival, else departure (one tree)."""
    i = FEATURES.index("alt_change_60")
    tree = {
        "feature": [i, -2, -2],
        "threshold": [-200.0, 0.0, 0.0],
        "left": [1, -1, -1],
        "right": [2, -1, -1],
        "value": [[0, 0, 0, 0], [9, 0, 0, 1], [0, 9, 0, 1]],
    }
    return JsonModel(
        {
            "format": FORMAT,
            "name": "phase-classifier",
            "version": "p-test",
            "kind": "classifier",
            "features": FEATURES,
            "classes": CLASSES,
            "model": {"type": "tree", "tree": tree},
            "metrics": {"macro_f1": 0.9},
        }
    )


def obs(alt, **kw):
    return {
        "hex": "ABC123",
        "lat": 25.9,
        "lon": -80.3,
        "alt_ft": alt,
        "vrate_fpm": 0,
        "gs_kt": 200,
        "track": 180.0,
        "on_ground": False,
        **kw,
    }


def test_uses_history_for_change_features():
    c = PhaseClassifier(model_by_alt_change())
    c.apply([obs(5000)], now=1000.0)
    # vrate says level, but altitude actually fell 1,000 ft in the last minute.
    assert c.apply([obs(4000)], now=1060.0) == {"ABC123": "arriving"}
    assert c.apply([obs(5000)], now=1120.0) == {"ABC123": "departing"}


def test_ground_is_ground_and_old_history_is_forgotten():
    c = PhaseClassifier(model_by_alt_change())
    assert c.apply([obs(0, on_ground=True)], now=0.0) == {"ABC123": "on-ground"}
    c.apply([obs(1000, hex="OLD")], now=0.0)
    c.apply([], now=1000.0)
    assert "OLD" not in c._history


def test_rejects_a_model_that_is_not_a_phase_model():
    bad = model_by_alt_change().spec | {"classes": ["a", "b", "c", "d"]}
    try:
        PhaseClassifier(JsonModel(bad))
    except ValueError:
        return
    raise AssertionError("accepted a model with unknown classes")


def test_provider_writes_model_phase_into_raw_data(monkeypatch):
    p = Adsb1090Provider.__new__(Adsb1090Provider)
    p.json_url, p.max_range_km, p.min_move_meters, p.max_seen_seconds = "x", 200.0, 0.0, 60.0
    p._last_emitted, p.last_poll = {}, {"received": 0, "observations": []}
    p.phase_classifier = PhaseClassifier(model_by_alt_change())
    p._model_phases = {}

    feed = {"alt": 6000}

    async def read():
        return [
            {
                "hex": "abc123",
                "flight": "AAL1",
                "lat": MIA_LAT + 0.2,
                "lon": MIA_LON,
                "alt_baro": feed["alt"],
                "baro_rate": 0,
                "gs": 220,
                "track": 180,
                "seen_pos": 1,
            }
        ]

    monkeypatch.setattr(p, "_read_feed", read)
    monkeypatch.setattr("src.providers.adsb1090_provider.time.time", lambda: 1000.0)
    asyncio.run(p.fetch_live_positions("MIA"))
    feed["alt"] = 5000
    monkeypatch.setattr("src.providers.adsb1090_provider.time.time", lambda: 1060.0)
    raw = asyncio.run(p.fetch_live_positions("MIA"))[0]

    row = p.normalize(raw, "live")
    assert row["raw_data"]["phase"] == "arriving"
    assert row["raw_data"]["phase_model"] == "p-test"
    assert row["direction"] == "arrival"
    assert p.last_poll["observations"][0]["phase"] == "arriving"  # hourly stats agree
