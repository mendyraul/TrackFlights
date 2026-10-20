"""Phase classifier: labeling from tracks, training, ship rule, serving model."""

import math
import random
from types import SimpleNamespace

import pandas as pd
import pytest

from src.ml.model_json import JsonModel
from src.ml.phase_features import CLASSES, FEATURES, phase_features
from src.services.track_log import TrackLog
from trackflights_ml.phase import (
    AIRPORTS,
    NotEnoughData,
    label_positions,
    load_tracks,
    train_and_export,
)

DAY0 = 1_790_000_000  # mid-September 2026
KM_PER_DEG_LAT = 111.0


def offset(lat, lon, bearing, km):
    b = math.radians(bearing)
    return (
        lat + km * math.cos(b) / KM_PER_DEG_LAT,
        lon + km * math.sin(b) / (KM_PER_DEG_LAT * math.cos(math.radians(lat))),
    )


def approach(rng, start_ts, airport, from_bearing, dist_km=110, alt=15000, step_s=30):
    """Straight-in descent to `airport`, then a few points on the ground."""
    alat, alon, _ = AIRPORTS[airport]
    lat, lon = offset(alat, alon, from_bearing, dist_km)
    pts, ts, d = [], start_ts, dist_km
    km_step = 250 * 1.852 * step_s / 3600
    while d > 0:
        lat, lon = offset(alat, alon, from_bearing, d)
        a = alt * d / dist_km
        pts.append(
            dict(
                ts=ts,
                lat=lat,
                lon=lon,
                alt_ft=round(a),
                vrate_fpm=-round(alt / (dist_km / km_step) * 2)
                + rng.randint(-150, 150),
                gs_kt=250 + rng.randint(-10, 10),
                track=(from_bearing + 180 + rng.uniform(-8, 8)) % 360,
                on_ground=False,
            )
        )
        d -= km_step
        ts += step_s
    for _ in range(3):
        pts.append(
            dict(
                ts=ts,
                lat=alat,
                lon=alon,
                alt_ft=0,
                vrate_fpm=0,
                gs_kt=15,
                track=90.0,
                on_ground=True,
            )
        )
        ts += step_s
    return pts


def departure(rng, start_ts, airport, to_bearing, dist_km=110, top=20000, step_s=30):
    alat, alon, _ = AIRPORTS[airport]
    pts, ts = [], start_ts
    for _ in range(2):
        pts.append(
            dict(
                ts=ts,
                lat=alat,
                lon=alon,
                alt_ft=0,
                vrate_fpm=0,
                gs_kt=12,
                track=to_bearing,
                on_ground=True,
            )
        )
        ts += step_s
    km_step, d, a = 260 * 1.852 * step_s / 3600, 1.0, 500
    while d < dist_km:
        lat, lon = offset(alat, alon, to_bearing, d)
        climbing = a < top
        pts.append(
            dict(
                ts=ts,
                lat=lat,
                lon=lon,
                alt_ft=round(a),
                vrate_fpm=(2200 if climbing else 0) + rng.randint(-150, 150),
                gs_kt=260,
                track=(to_bearing + rng.uniform(-8, 8)) % 360,
                on_ground=False,
            )
        )
        a = min(top, a + 1100)
        d += km_step
        ts += step_s
    return pts


def overflight(rng, start_ts, passing_km=35, minutes=40, step_s=30, alt=35000):
    # A straight leg passing `passing_km` from MIA.
    mlat, mlon, _ = AIRPORTS["MIA"]
    heading = rng.uniform(0, 360)
    clat, clon = offset(mlat, mlon, heading + 90, passing_km)
    km_step = 460 * 1.852 * step_s / 3600
    n = minutes * 60 // step_s
    pts = []
    for i in range(n):
        lat, lon = offset(clat, clon, heading, (i - n / 2) * km_step)
        pts.append(
            dict(
                ts=start_ts + i * step_s,
                lat=lat,
                lon=lon,
                alt_ft=alt + rng.randint(-50, 50),
                vrate_fpm=rng.randint(-64, 64),
                gs_kt=460,
                track=heading % 360,
                on_ground=False,
            )
        )
    return pts


def simulate(path, days=6, seed=3):
    rng = random.Random(seed)
    flights = []  # (hex, kind, points)
    n = 0
    for day in range(days):
        base = DAY0 + day * 86400
        for k in range(8):
            n += 1
            flights.append(
                (
                    f"A{n:05d}",
                    "arrival_mia",
                    approach(rng, base + k * 3000, "MIA", rng.uniform(0, 360)),
                )
            )
            n += 1
            flights.append(
                (
                    f"D{n:05d}",
                    "departure_mia",
                    departure(rng, base + k * 3000 + 900, "MIA", rng.uniform(0, 360)),
                )
            )
        for k in range(6):
            n += 1
            # Into FLL from the north/east, passing within ~30 km of MIA: the
            # current rules call these MIA arrivals.
            flights.append(
                (
                    f"F{n:05d}",
                    "other_airport",
                    approach(
                        rng,
                        base + 40000 + k * 2500,
                        "FLL",
                        rng.uniform(-40, 120),
                        dist_km=70,
                        alt=9000,
                    ),
                )
            )
            n += 1
            flights.append(
                (f"O{n:05d}", "overflight", overflight(rng, base + 50000 + k * 4000))
            )
        n += 1
        flights.append((f"S{n:05d}", "short", overflight(rng, base + 70000, minutes=5)))

    clock = SimpleNamespace(t=0)
    log = TrackLog(
        str(path),
        sample_seconds=0,
        clock=lambda: clock.t,
        disk_usage=lambda _p: SimpleNamespace(free=1e12),
    )
    for hex_id, _, pts in flights:
        for p in pts:
            clock.t = p["ts"]
            log.record([{**p, "hex": hex_id, "distance_km": 0.0}])
    log.close()
    return flights


@pytest.fixture(scope="module")
def tracks(tmp_path_factory):
    path = tmp_path_factory.mktemp("tracks") / "tracks.db"
    flights = simulate(path)
    return path, flights


def test_labels_follow_what_each_aircraft_did(tracks):
    path, flights = tracks
    labeled = label_positions(load_tracks(path))
    for hex_id, kind, _ in flights:
        got = labeled.loc[
            (labeled["hex"] == hex_id) & labeled["label"].notna(), "label"
        ]
        if kind == "short":
            assert got.empty, "a 5-minute fragment must stay unlabeled"
            continue
        assert len(got) > 0, f"{hex_id} has no labels"
        assert (got == kind).mean() > 0.9, f"{hex_id}: {got.value_counts().to_dict()}"
    # Positions on the ground are never training samples.
    assert labeled.loc[labeled["on_ground"], "label"].isna().all()


def test_model_beats_the_rules_ships_and_runs_on_the_pi(tracks, tmp_path):
    path, _ = tracks
    model_path, report = tmp_path / "phase.json", tmp_path / "phase.md"

    summary = train_and_export(path, model_path, report)

    assert summary["ships"] is True
    assert summary["macro_f1"] > summary["baseline_macro_f1"]
    text = report.read_text()
    assert "Shipped" in text and "Confusion matrix" in text
    assert (tmp_path / "phase_label_samples.png").exists()

    model = JsonModel.load(model_path)
    assert model.classes == sorted(CLASSES) and model.features == FEATURES

    # Spot-check on real points from simulated flights (with their history),
    # mid-approach, rather than hand-made feature values: a model can only be
    # trusted inside the range it was trained on.
    _, flights = tracks

    def mid_approach(kind):
        pts = next(p for _, k, p in flights if k == kind)
        airborne = [p for p in pts if not p["on_ground"]]
        i = len(airborne) * 2 // 3
        return model.predict_label(phase_features(airborne[i], airborne[:i]))

    assert mid_approach("arrival_mia") == "arrival_mia"
    assert mid_approach("other_airport") == "other_airport"
    assert mid_approach("overflight") == "overflight"


def test_refuses_to_train_on_too_few_days(tmp_path):
    path = tmp_path / "tracks.db"
    simulate(path, days=2)
    with pytest.raises(NotEnoughData):
        train_and_export(path, tmp_path / "m.json", tmp_path / "r.md")


def test_dataset_has_no_rows_from_the_ground_or_unlabeled(tracks):
    from trackflights_ml.phase import build_dataset

    path, _ = tracks
    data = build_dataset(label_positions(load_tracks(path)), max_rows=None)
    assert set(data["label"]) <= set(CLASSES)
    assert (data["alt_ft"] > 0).all()
    assert isinstance(data["day"].iloc[0], type(pd.Timestamp("2026-01-01").date()))


def test_trained_model_runs_in_the_pi_classifier_poll_by_poll(tracks, tmp_path):
    from src.ml.phase_service import PhaseClassifier

    path, flights = tracks
    model_path = tmp_path / "phase.json"
    train_and_export(path, model_path, tmp_path / "phase.md")
    classifier = PhaseClassifier(JsonModel.load(model_path))

    # Replay one FLL arrival the way the Pi sees it: one observation per poll.
    _, _, pts = next(f for f in flights if f[1] == "other_airport")
    seen = []
    for p in pts:
        phase = classifier.apply([{**p, "hex": "FLL1"}], now=p["ts"])["FLL1"]
        seen.append(phase)
    airborne = [s for s, p in zip(seen, pts, strict=True) if not p["on_ground"]]
    assert airborne.count("other-airport") / len(airborne) > 0.8
    assert seen[-1] == "on-ground"
