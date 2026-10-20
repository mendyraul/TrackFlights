"""Traffic forecast: features, dataset building, evaluation and the ship rule."""

from datetime import UTC, date, datetime

import numpy as np
import pandas as pd
import pytest

from src.ml.forecast_features import FEATURES, forecast_features, is_us_holiday
from src.ml.model_json import JsonModel
from trackflights_ml.forecast import NotEnoughData, build_dataset, train_and_export


def synthetic_traffic(
    days: int, *, noise: float = 2.0, storms: bool = True, seed: int = 1
):
    """Hourly traffic with a daily curve, quieter weekends, and storms that cut
    traffic. Weather is the part "same hour last week" can't know about."""
    rng = np.random.default_rng(seed)
    hours = pd.date_range("2026-08-03 04:00Z", periods=days * 24, freq="h")
    local = hours.tz_convert("America/New_York")
    daily = (
        15
        + 25 * np.exp(-((local.hour - 17) ** 2) / 18)
        + 10 * np.exp(-((local.hour - 9) ** 2) / 8)
    )
    weekend = np.where(local.dayofweek >= 5, 0.8, 1.0)
    storm = (rng.random(len(hours)) < 0.08) if storms else np.zeros(len(hours), bool)
    y = daily * weekend * np.where(storm, 0.55, 1.0) + rng.normal(0, noise, len(hours))
    return pd.DataFrame(
        {
            "hour": hours.strftime("%Y-%m-%dT%H:%M:%S+00:00"),
            "unique_aircraft": np.maximum(0, np.round(y)).astype(int),
            "polls": np.where(
                rng.random(len(hours)) < 0.03, 60, 240
            ),  # occasional outage
            "temp_c": 28 + rng.normal(0, 2, len(hours)),
            "wind_kt": np.where(storm, 25, 8) + rng.normal(0, 2, len(hours)),
            "precip_mm": np.where(storm, 6.0, 0.0),
            "is_thunderstorm": storm,
        }
    )


# ── Features ────────────────────────────────────────────────────────────


def test_features_use_miami_local_time_across_dst():
    # 21:00 UTC is 5 pm EDT in October and 4 pm EST in December.
    oct_ = forecast_features(datetime(2026, 10, 19, 21, tzinfo=UTC), None, 30)
    dec = forecast_features(datetime(2026, 12, 14, 21, tzinfo=UTC), None, 30)
    assert oct_["hour_sin"] != pytest.approx(dec["hour_sin"])
    assert set(oct_) == set(FEATURES)
    assert oct_["weather_missing"] == 1.0 and oct_["lag_168"] == 30.0


def test_us_holidays():
    assert is_us_holiday(date(2026, 11, 26))  # Thanksgiving: 4th Thursday
    assert is_us_holiday(date(2026, 5, 25))  # Memorial Day: last Monday of May
    assert is_us_holiday(date(2026, 1, 19))  # MLK Day: 3rd Monday
    assert not is_us_holiday(date(2026, 11, 19))


# ── Dataset ─────────────────────────────────────────────────────────────


def test_dataset_drops_outages_and_hours_without_a_lag(tmp_path):
    df = synthetic_traffic(21)
    csv = tmp_path / "t.csv"
    df.to_csv(csv, index=False)
    from trackflights_ml.forecast import load_traffic

    data = build_dataset(load_traffic(csv))
    first = pd.Timestamp(df["hour"].iloc[0])
    assert data["hour"].min() >= first + pd.Timedelta(days=7)  # first week has no lag
    good_hours = set(pd.to_datetime(df.loc[df["polls"] >= 200, "hour"], utc=True))
    assert set(data["hour"]) <= good_hours  # outage hours never used as targets
    assert list(data.columns[2:]) == FEATURES


# ── Training and the ship rule ──────────────────────────────────────────


def test_model_that_beats_the_baselines_ships_and_runs_on_the_pi(tmp_path):
    csv = tmp_path / "t.csv"
    synthetic_traffic(42).to_csv(csv, index=False)
    model_path, report = (
        tmp_path / "models/forecast.json",
        tmp_path / "reports/forecast.md",
    )

    summary = train_and_export(csv, model_path, report)

    assert summary["ships"] is True
    assert summary["mae"] < summary["best_baseline_mae"]
    assert report.exists() and report.with_suffix(".png").exists()
    assert "Shipped" in report.read_text()

    model = JsonModel.load(model_path)
    assert model.name == "traffic-forecast" and model.features == FEATURES
    assert model.metrics["improvement_pct"] > 0
    calm = forecast_features(
        datetime(2026, 9, 15, 21, tzinfo=UTC),
        {"temp_c": 28, "wind_kt": 8, "precip_mm": 0},
        40,
    )
    storm = forecast_features(
        datetime(2026, 9, 15, 21, tzinfo=UTC),
        {"temp_c": 28, "wind_kt": 25, "precip_mm": 6, "is_thunderstorm": True},
        40,
    )
    assert model.predict(storm) < model.predict(calm)  # learned the storm effect


def test_nothing_ships_when_last_week_already_says_it_all(tmp_path):
    # Identical every week, no weather effect: "same hour last week" is perfect.
    df = synthetic_traffic(42, noise=0.0, storms=False)
    df["polls"] = 240
    week = df["unique_aircraft"].to_numpy()[: 7 * 24]
    df["unique_aircraft"] = np.tile(week, 6)
    csv = tmp_path / "t.csv"
    df.to_csv(csv, index=False)
    model_path, report = tmp_path / "forecast.json", tmp_path / "forecast.md"

    summary = train_and_export(csv, model_path, report)

    assert summary["ships"] is False
    assert not model_path.exists()
    assert "Not shipped" in report.read_text()


def test_refuses_to_train_on_too_little_history(tmp_path):
    csv = tmp_path / "t.csv"
    synthetic_traffic(12).to_csv(csv, index=False)
    with pytest.raises(NotEnoughData):
        train_and_export(csv, tmp_path / "m.json", tmp_path / "r.md")
