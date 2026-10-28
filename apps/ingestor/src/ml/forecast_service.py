"""Hourly traffic forecast on the Pi.

Once an hour, predicts distinct aircraft for each of the next 6 hours with
the exported model (FORECAST_MODEL_PATH) and upserts them into
traffic_forecast. Inputs per target hour: the Open-Meteo forecast the
weather ingester already fetched, and the same hour one week earlier from
traffic_hourly (one small read of 6 rows per hour). Hours whose week-ago
value is missing or came from a poorly covered hour are skipped rather than
guessed.
"""

from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

import structlog

from src.ml.forecast_features import forecast_features, weather_from_snapshot
from src.ml.model_json import JsonModel

logger = structlog.get_logger()

HORIZON_HOURS = 6
MIN_POLLS = 200  # same coverage bar as training


class ForecastStore(Protocol):
    def get_traffic_counts(self, hours: list[datetime]) -> dict[datetime, tuple[int, int]]: ...
    def upsert_traffic_forecast(self, rows: list[dict[str, Any]]) -> None: ...


def _floor_hour(t: datetime) -> datetime:
    return t.astimezone(UTC).replace(minute=0, second=0, microsecond=0)


def _parse_hour(value: str) -> datetime | None:
    try:
        t = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    # Open-Meteo is queried with timezone=UTC and returns naive times.
    return _floor_hour(t if t.tzinfo else t.replace(tzinfo=UTC))


class ForecastService:
    def __init__(self, model: JsonModel, store: ForecastStore) -> None:
        if model.kind != "regressor":
            raise ValueError("forecast model must be a regressor")
        self.model = model
        self.store = store
        self._last_run: datetime | None = None

    @classmethod
    def from_path(cls, path: str, store: ForecastStore) -> "ForecastService":
        return cls(JsonModel.load(path), store)

    def maybe_run(self, now: datetime, weather_forecast: list[dict[str, Any]]) -> int:
        """Forecast the next hours once per clock hour. Returns rows written."""
        this_hour = _floor_hour(now)
        if self._last_run == this_hour:
            return 0

        targets = [this_hour + timedelta(hours=k) for k in range(1, HORIZON_HOURS + 1)]
        week_ago = self.store.get_traffic_counts([t - timedelta(days=7) for t in targets])
        weather: dict[datetime, dict[str, Any] | None] = {}
        for snap in weather_forecast or []:
            hour = _parse_hour(snap.get("observed_at"))
            if hour is not None:
                weather[hour] = weather_from_snapshot(snap)

        m = self.model.metrics
        rows = []
        for target in targets:
            lag = week_ago.get(target - timedelta(days=7))
            if lag is None or lag[1] < MIN_POLLS:
                continue
            features = forecast_features(target, weather.get(target), float(lag[0]))
            rows.append(
                {
                    "hour": target.isoformat(),
                    "predicted_aircraft": round(max(0.0, self.model.predict(features)), 1),
                    "model_version": self.model.version,
                    "model_mae": m.get("mae"),
                    "baseline_mae": m.get("best_baseline_mae"),
                }
            )

        if rows:
            self.store.upsert_traffic_forecast(rows)
        self._last_run = this_hour
        logger.info("Traffic forecast", hours=len(rows), skipped=len(targets) - len(rows))
        return len(rows)
