"""Hourly forecast on the Pi: inputs, skipping rules, once-per-hour cadence."""

from datetime import UTC, datetime, timedelta

from src.ml.forecast_features import FEATURES
from src.ml.forecast_service import ForecastService
from src.ml.model_json import FORMAT, JsonModel


def lag_model(weather_weight: float = 0.0) -> JsonModel:
    """Predicts last week's count, minus weather_weight per mm of rain."""
    coef = [0.0] * len(FEATURES)
    coef[FEATURES.index("lag_168")] = 1.0
    coef[FEATURES.index("precip_mm")] = -weather_weight
    return JsonModel(
        {
            "format": FORMAT,
            "name": "traffic-forecast",
            "version": "v-test",
            "kind": "regressor",
            "features": FEATURES,
            "metrics": {"mae": 1.8, "best_baseline_mae": 2.7},
            "model": {"type": "linear", "coef": [coef], "intercept": [0.0]},
        }
    )


class FakeStore:
    def __init__(self, counts):
        self.counts = counts
        self.written: list[dict] = []
        self.reads = 0

    def get_traffic_counts(self, hours):
        self.reads += 1
        return {h: self.counts[h] for h in hours if h in self.counts}

    def upsert_traffic_forecast(self, rows):
        self.written.extend(rows)


NOW = datetime(2026, 10, 20, 14, 7, tzinfo=UTC)
NEXT = [datetime(2026, 10, 20, 15, tzinfo=UTC) + timedelta(hours=k) for k in range(6)]


def test_forecasts_next_six_hours_from_last_week_and_weather():
    counts = {h - timedelta(days=7): (30 + i, 240) for i, h in enumerate(NEXT)}
    store = FakeStore(counts)
    rain = [{"observed_at": "2026-10-20T16:00", "precipitation_mm": 5.0, "temperature_c": 25}]

    written = ForecastService(lag_model(weather_weight=2.0), store).maybe_run(NOW, rain)

    assert written == 6
    by_hour = {r["hour"]: r for r in store.written}
    assert by_hour[NEXT[0].isoformat()]["predicted_aircraft"] == 30.0
    assert by_hour[NEXT[1].isoformat()]["predicted_aircraft"] == 31.0 - 10.0  # 5 mm rain
    row = by_hour[NEXT[0].isoformat()]
    assert row["model_version"] == "v-test" and row["model_mae"] == 1.8
    assert row["baseline_mae"] == 2.7


def test_skips_hours_without_a_trustworthy_week_ago_value():
    counts = {
        NEXT[0] - timedelta(days=7): (30, 240),
        NEXT[1] - timedelta(days=7): (2, 50),  # receiver outage last week
    }
    store = FakeStore(counts)
    assert ForecastService(lag_model(), store).maybe_run(NOW, []) == 1
    assert [r["hour"] for r in store.written] == [NEXT[0].isoformat()]


def test_runs_once_per_clock_hour_and_never_predicts_negative():
    counts = {h - timedelta(days=7): (1, 240) for h in NEXT}
    store = FakeStore(counts)
    service = ForecastService(lag_model(weather_weight=10.0), store)
    storm = [{"observed_at": h.strftime("%Y-%m-%dT%H:%M"), "precipitation_mm": 9.0} for h in NEXT]

    assert service.maybe_run(NOW, storm) == 6
    assert all(r["predicted_aircraft"] == 0.0 for r in store.written)
    assert service.maybe_run(NOW + timedelta(minutes=40), storm) == 0  # same hour
    assert store.reads == 1
    assert service.maybe_run(NOW + timedelta(hours=1), storm) > 0
