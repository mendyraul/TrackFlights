"""Train and evaluate the hourly traffic forecast.

Data: traffic_hourly exported to CSV (see export_traffic.py). Target: distinct
aircraft heard in the hour. Features: src/ml/forecast_features.py (shared
with the Pi).

Evaluation is time-ordered: the most recent `test_days` are held out and
everything before is training data, so the model is always scored on hours
it has never seen, in the future of its training data. Two baselines set the
bar:

  * seasonal naive: "same hour last week" (the lag_168 feature on its own),
  * hour-of-week mean: the average for that weekday and hour in training.

A model is only exported if it beats both on held-out MAE. The shipped model
is refit on all the data; the metrics it carries are the held-out ones.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from src.ml.forecast_features import FEATURES, MIAMI, forecast_features
from trackflights_ml.export import export_model, save_model

MODEL_NAME = "traffic-forecast"
WEATHER_COLUMNS = ["temp_c", "wind_kt", "precip_mm", "is_thunderstorm"]


class NotEnoughData(Exception):
    pass


def load_traffic(path: str | Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    df["hour"] = pd.to_datetime(df["hour"], utc=True)
    for col in WEATHER_COLUMNS:
        if col not in df:
            df[col] = np.nan
    return df.sort_values("hour").drop_duplicates("hour").reset_index(drop=True)


def build_dataset(df: pd.DataFrame, min_polls: int = 200) -> pd.DataFrame:
    """One row per usable hour: features, target, and the hour itself.

    Hours with poor receiver coverage are dropped (as targets and as lags):
    an outage isn't a quiet hour.
    """
    good = df[df["polls"] >= min_polls].set_index("hour")
    counts = good["unique_aircraft"]
    rows = []
    for hour, rec in good.iterrows():
        lag = counts.get(hour - pd.Timedelta(days=7))
        if lag is None or pd.isna(lag):
            continue
        weather = {c: (None if pd.isna(rec[c]) else rec[c]) for c in WEATHER_COLUMNS}
        feats = forecast_features(hour.to_pydatetime(), weather, float(lag))
        rows.append({"hour": hour, "y": float(rec["unique_aircraft"]), **feats})
    return pd.DataFrame(rows)


@dataclass
class Result:
    name: str
    mae: float
    mape: float
    predictions: np.ndarray


def _score(name: str, y: np.ndarray, pred: np.ndarray) -> Result:
    mae = float(np.mean(np.abs(y - pred)))
    nonzero = y > 0
    mape = float(np.mean(np.abs((y[nonzero] - pred[nonzero]) / y[nonzero])) * 100)
    return Result(name, mae, mape, pred)


def _hour_of_week(hours: pd.Series) -> pd.Series:
    local = hours.dt.tz_convert(MIAMI)
    return local.dt.dayofweek * 24 + local.dt.hour


def candidates() -> dict[str, Any]:
    return {
        "ridge": make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
        "gradient_boosting": GradientBoostingRegressor(
            n_estimators=200, max_depth=3, learning_rate=0.05, random_state=0
        ),
    }


def evaluate(data: pd.DataFrame, test_days: int = 7) -> dict[str, Any]:
    if data.empty:
        raise NotEnoughData(
            "no usable hours yet (need a week of history for lag features)"
        )
    cutoff = data["hour"].max() - pd.Timedelta(days=test_days)
    train, test = data[data["hour"] <= cutoff], data[data["hour"] > cutoff]
    span = (train["hour"].max() - train["hour"].min()).days if len(train) else 0
    if span < 14 or len(test) < 24 * min(test_days, 3):
        raise NotEnoughData(
            f"need at least 14 days of training data plus a held-out week; have {span} days"
        )

    y_test = test["y"].to_numpy()
    results = [
        _score(
            "seasonal_naive (same hour last week)", y_test, test["lag_168"].to_numpy()
        )
    ]

    how_train = _hour_of_week(train["hour"])
    means = train.groupby(how_train.values)["y"].mean()
    how_pred = (
        _hour_of_week(test["hour"]).map(means).fillna(train["y"].mean()).to_numpy()
    )
    results.append(_score("hour_of_week_mean", y_test, how_pred))
    baseline_mae = min(r.mae for r in results)

    fitted = {}
    for name, model in candidates().items():
        model.fit(train[FEATURES], train["y"])
        fitted[name] = model
        results.append(_score(name, y_test, model.predict(test[FEATURES])))

    model_results = [r for r in results if r.name in fitted]
    best = min(model_results, key=lambda r: r.mae)
    return {
        "train": train,
        "test": test,
        "results": results,
        "best": best,
        "baseline_mae": baseline_mae,
        "ships": best.mae < baseline_mae,
    }


def train_and_export(
    traffic_csv: str | Path,
    model_out: str | Path,
    report_out: str | Path,
    test_days: int = 7,
) -> dict[str, Any]:
    data = build_dataset(load_traffic(traffic_csv))
    ev = evaluate(data, test_days)
    best: Result = ev["best"]
    seasonal = ev["results"][0]

    metrics = {
        "heldout_days": test_days,
        "mae": round(best.mae, 2),
        "mape_pct": round(best.mape, 1),
        "baseline": seasonal.name,
        "baseline_mae": round(seasonal.mae, 2),
        "best_baseline_mae": round(ev["baseline_mae"], 2),
        # A perfect baseline (MAE 0) leaves nothing to improve on.
        "improvement_pct": (
            round((1 - best.mae / ev["baseline_mae"]) * 100, 1)
            if ev["baseline_mae"] > 0
            else None
        ),
        "model": best.name,
        "train_hours": len(ev["train"]),
    }

    if ev["ships"]:
        final = candidates()[best.name].fit(data[FEATURES], data["y"])
        save_model(
            export_model(final, name=MODEL_NAME, features=FEATURES, metrics=metrics),
            model_out,
        )

    _write_report(ev, metrics, Path(report_out))
    return {"ships": ev["ships"], **metrics}


def _write_report(ev: dict[str, Any], metrics: dict[str, Any], path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    path.parent.mkdir(parents=True, exist_ok=True)
    test = ev["test"]
    best: Result = ev["best"]

    fig, ax = plt.subplots(figsize=(11, 4))
    ax.plot(test["hour"], test["y"], label="actual", color="black", linewidth=1.5)
    ax.plot(
        test["hour"],
        ev["results"][0].predictions,
        label="same hour last week",
        color="tab:gray",
        linestyle="--",
    )
    ax.plot(test["hour"], best.predictions, label=best.name, color="tab:blue")
    ax.set_ylabel("aircraft per hour")
    ax.set_title("Held-out week: actual vs forecast")
    ax.legend()
    fig.tight_layout()
    chart = path.with_suffix(".png")
    fig.savefig(chart, dpi=110)
    plt.close(fig)

    lines = [
        "# Traffic forecast: evaluation",
        "",
        f"Trained on {metrics['train_hours']} hours; scored on the following "
        f"{metrics['heldout_days']} days, which the models never saw.",
        "",
        "| Model | MAE (aircraft/hour) | MAPE |",
        "|---|---|---|",
    ]
    for r in ev["results"]:
        lines.append(f"| {r.name} | {r.mae:.2f} | {r.mape:.1f}% |")
    verdict = (
        f"**Shipped:** {best.name}, {metrics['improvement_pct']}% lower MAE than the best "
        "baseline. Exported to the model file and refit on all data."
        if ev["ships"]
        else "**Not shipped:** no model beat the baselines on held-out data. The site keeps "
        "showing history only."
    )
    lines += ["", verdict, "", f"![Held-out week]({chart.name})", ""]
    path.write_text("\n".join(lines))
