"""Learn arrival/departure from what aircraft actually did.

Labels come from the track log the Pi keeps (positions sampled every ~30 s),
by looking at each aircraft's own future and past:

  arrival_mia    within the next 45 min it is seen low (<= 1,500 ft, or on the
                 ground) within 8 km of KMIA. If it passes low near several
                 fields in that window (final into MIA runs close to OPF and
                 TMB), the one where it got lowest wins: touchdown beats a
                 1,400 ft pass overhead.
  departure_mia  within the previous 45 min it was low near KMIA, and it is
                 now climbing (or has no landing ahead)
  other_airport  the same tests at another South Florida field (FLL, OPF...)
  overflight     a track of 20+ minutes with no low pass near any airport,
                 seen for 10+ minutes on either side of the sample
  (unlabeled)    everything else: too short, gaps, ambiguous. Dropped.

Training holds out the most recent days (whole days, so samples of one
flight never sit on both sides), scores the hand-written heuristic as the
baseline, and exports a model only if it beats the heuristic's macro-F1.
"""

import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.utils.class_weight import compute_sample_weight

from src.ml.forecast_features import MIAMI
from src.ml.phase_features import CLASSES, FEATURES, phase_features
from src.services.phase import distance_km, infer_phase
from trackflights_ml.export import export_model, save_model

MODEL_NAME = "phase-classifier"

# (lat, lon, radius_km). KMIA first; the rest count as "other airport".
AIRPORTS = {
    "MIA": (25.79325, -80.29056, 8.0),
    "FLL": (26.0726, -80.1527, 8.0),
    "PBI": (26.6832, -80.0956, 8.0),
    "RSW": (26.5362, -81.7552, 8.0),
    "EYW": (24.5561, -81.7596, 6.0),
    "OPF": (25.9070, -80.2784, 5.0),
    "TMB": (25.6479, -80.4328, 5.0),
    "HWO": (26.0012, -80.2407, 5.0),
    "FXE": (26.1973, -80.1707, 5.0),
    "BCT": (26.3785, -80.1077, 5.0),
    "APF": (26.1526, -81.7753, 5.0),
    "MTH": (24.7261, -81.0514, 5.0),
    "HST": (25.4886, -80.3836, 6.0),
}
LOW_ALT_FT = 1500
WINDOW_S = 45 * 60
TRACK_GAP_S = 10 * 60
OVERFLIGHT_SPAN_S = 20 * 60
OVERFLIGHT_MARGIN_S = 10 * 60
CLIMBING_FPM = 300

HEURISTIC_TO_CLASS = {
    "arriving": "arrival_mia",
    "departing": "departure_mia",
    "overflight": "overflight",
    "on-ground": "overflight",
    "unknown": "overflight",
}


class NotEnoughData(Exception):
    pass


# ── Loading and labeling ────────────────────────────────────────────────


def load_tracks(path: str | Path) -> pd.DataFrame:
    with sqlite3.connect(f"file:{path}?mode=ro", uri=True) as db:
        df = pd.read_sql_query("SELECT * FROM positions ORDER BY hex, ts", db)
    df["on_ground"] = df["on_ground"].astype(bool)
    return df


def _nearest_airport(lat: float, lon: float) -> str | None:
    for code, (alat, alon, radius) in AIRPORTS.items():
        if distance_km(lat, lon, alat, alon) <= radius:
            return code
    return None


def label_positions(df: pd.DataFrame) -> pd.DataFrame:
    """Add `track_id` and `label` (None = unlabeled) to every position."""
    df = df.sort_values(["hex", "ts"]).reset_index(drop=True)
    new_track = (df["hex"] != df["hex"].shift()) | (df["ts"].diff() > TRACK_GAP_S)
    df["track_id"] = new_track.cumsum()
    labels: list[str | None] = [None] * len(df)

    for _, track in df.groupby("track_id", sort=False):
        idx = track.index.to_numpy()
        ts = track["ts"].to_numpy()
        low = (
            track["on_ground"] | (track["alt_ft"].fillna(1e9) <= LOW_ALT_FT)
        ).to_numpy()
        alts = np.where(track["on_ground"], 0, track["alt_ft"].fillna(1e9)).astype(
            float
        )
        touch_ts, touch_ap, touch_alt = [], [], []
        for i, (lat, lon) in enumerate(zip(track["lat"], track["lon"], strict=True)):
            if low[i]:
                ap = _nearest_airport(lat, lon)
                if ap:
                    touch_ts.append(ts[i])
                    touch_ap.append(ap)
                    touch_alt.append(alts[i])
        touch_ts_arr = np.array(touch_ts)
        touch_alt_arr = np.array(touch_alt)
        span_start, span_end = ts[0], ts[-1]
        long_track = span_end - span_start >= OVERFLIGHT_SPAN_S
        vrate = track["vrate_fpm"].fillna(0).to_numpy()
        on_ground = track["on_ground"].to_numpy()

        for i, t in enumerate(ts):
            if on_ground[i]:
                continue
            nxt = prv = None
            if len(touch_ts_arr):
                # Touches in (t, t + window]: the lowest one (latest on ties).
                a = np.searchsorted(touch_ts_arr, t, side="right")
                b = np.searchsorted(touch_ts_arr, t + WINDOW_S, side="right")
                if b > a:
                    seg = touch_alt_arr[a:b]
                    j = a + (len(seg) - 1 - int(np.argmin(seg[::-1])))
                    nxt = touch_ap[j]
                # Touches in [t - window, t): the lowest one (earliest on ties).
                a = np.searchsorted(touch_ts_arr, t - WINDOW_S, side="left")
                b = np.searchsorted(touch_ts_arr, t, side="left")
                if b > a:
                    prv = touch_ap[a + int(np.argmin(touch_alt_arr[a:b]))]
            climbing = vrate[i] >= CLIMBING_FPM
            if prv and (climbing or not nxt):
                labels[idx[i]] = "departure_mia" if prv == "MIA" else "other_airport"
            elif nxt:
                labels[idx[i]] = "arrival_mia" if nxt == "MIA" else "other_airport"
            elif (
                not len(touch_ts_arr)
                and long_track
                and t - span_start >= OVERFLIGHT_MARGIN_S
                and span_end - t >= OVERFLIGHT_MARGIN_S
            ):
                labels[idx[i]] = "overflight"
    df["label"] = labels
    return df


def build_dataset(labeled: pd.DataFrame, max_rows: int | None = 200_000, seed: int = 0):
    """Feature rows for labeled positions, using each aircraft's earlier positions."""
    rows = []
    for _, track in labeled.groupby("track_id", sort=False):
        points = track.to_dict("records")
        start = 0
        for i, p in enumerate(points):
            if p["label"] is None:
                continue
            while points[start]["ts"] < p["ts"] - 170:
                start += 1
            feats = phase_features(p, points[start:i])
            if feats is None:
                continue
            heuristic = infer_phase(
                p["lat"],
                p["lon"],
                p["alt_ft"],
                p["vrate_fpm"],
                p["track"],
                on_ground=False,
            )
            rows.append(
                {
                    "ts": p["ts"],
                    "label": p["label"],
                    "heuristic": HEURISTIC_TO_CLASS[heuristic],
                    **feats,
                }
            )
    data = pd.DataFrame(rows)
    if max_rows and len(data) > max_rows:
        data = data.sample(max_rows, random_state=seed).sort_values("ts")
    if not data.empty:
        data["day"] = (
            pd.to_datetime(data["ts"], unit="s", utc=True).dt.tz_convert(MIAMI).dt.date
        )
    return data.reset_index(drop=True)


# ── Training and evaluation ─────────────────────────────────────────────


@dataclass
class Scored:
    name: str
    accuracy: float
    macro_f1: float
    predictions: np.ndarray


def candidates() -> dict[str, Any]:
    return {
        "logistic_regression": make_pipeline(
            StandardScaler(), LogisticRegression(max_iter=2000, class_weight="balanced")
        ),
        "decision_tree": DecisionTreeClassifier(
            max_depth=6, min_samples_leaf=50, class_weight="balanced", random_state=0
        ),
        "gradient_boosting": GradientBoostingClassifier(
            n_estimators=150, max_depth=3, learning_rate=0.1, random_state=0
        ),
    }


def _fit(name: str, model: Any, X: pd.DataFrame, y: pd.Series) -> Any:
    if name == "gradient_boosting":  # no class_weight option; weight samples instead
        return model.fit(X, y, sample_weight=compute_sample_weight("balanced", y))
    return model.fit(X, y)


def _score(name: str, y: np.ndarray, pred: np.ndarray) -> Scored:
    return Scored(
        name,
        float(accuracy_score(y, pred)),
        float(f1_score(y, pred, labels=CLASSES, average="macro", zero_division=0)),
        pred,
    )


def evaluate(data: pd.DataFrame, test_fraction: float = 0.25) -> dict[str, Any]:
    days = sorted(data["day"].unique()) if not data.empty else []
    if len(days) < 4:
        raise NotEnoughData(f"need at least 4 days of labeled tracks, have {len(days)}")
    n_test = max(1, round(len(days) * test_fraction))
    test_days = set(days[-n_test:])
    train, test = data[~data["day"].isin(test_days)], data[data["day"].isin(test_days)]
    missing = set(CLASSES) - set(train["label"])
    if missing:
        raise NotEnoughData(f"no training examples of {sorted(missing)} yet")

    y_test = test["label"].to_numpy()
    results = [
        _score("heuristic (current rules)", y_test, test["heuristic"].to_numpy())
    ]
    fitted = {}
    for name, model in candidates().items():
        fitted[name] = _fit(name, model, train[FEATURES], train["label"])
        results.append(_score(name, y_test, fitted[name].predict(test[FEATURES])))
    best = max(results[1:], key=lambda r: r.macro_f1)
    return {
        "train": train,
        "test": test,
        "results": results,
        "best": best,
        "ships": best.macro_f1 > results[0].macro_f1,
        "test_days": sorted(test_days),
    }


def train_and_export(
    tracks_db: str | Path,
    model_out: str | Path,
    report_out: str | Path,
    max_rows: int | None = 200_000,
) -> dict[str, Any]:
    raw = load_tracks(tracks_db)
    labeled = label_positions(raw)
    data = build_dataset(labeled, max_rows=max_rows)
    ev = evaluate(data)
    best: Scored = ev["best"]
    heuristic = ev["results"][0]

    metrics = {
        "model": best.name,
        "macro_f1": round(best.macro_f1, 3),
        "accuracy": round(best.accuracy, 3),
        "baseline": heuristic.name,
        "baseline_macro_f1": round(heuristic.macro_f1, 3),
        "baseline_accuracy": round(heuristic.accuracy, 3),
        "train_samples": len(ev["train"]),
        "test_samples": len(ev["test"]),
        "heldout_days": len(ev["test_days"]),
    }
    if ev["ships"]:
        final = _fit(best.name, candidates()[best.name], data[FEATURES], data["label"])
        save_model(
            export_model(final, name=MODEL_NAME, features=FEATURES, metrics=metrics),
            model_out,
        )

    coverage = {
        "positions": len(raw),
        "labeled": int(labeled["label"].notna().sum()),
        "by_label": labeled["label"].value_counts(dropna=False).to_dict(),
    }
    _write_report(ev, metrics, coverage, labeled, Path(report_out))
    return {"ships": ev["ships"], **metrics}


# ── Report ──────────────────────────────────────────────────────────────


def _write_report(ev, metrics, coverage, labeled, path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    path.parent.mkdir(parents=True, exist_ok=True)
    y_test = ev["test"]["label"].to_numpy()
    best: Scored = ev["best"]

    # Spot-check: 40 random labeled tracks on a map, colored by label.
    colors = {
        "arrival_mia": "tab:blue",
        "departure_mia": "tab:green",
        "other_airport": "tab:orange",
        "overflight": "tab:gray",
    }
    sample_tracks = labeled.dropna(subset=["label"])["track_id"].drop_duplicates()
    sample_tracks = sample_tracks.sample(min(40, len(sample_tracks)), random_state=0)
    fig, ax = plt.subplots(figsize=(7, 7))
    for tid in sample_tracks:
        t = labeled[(labeled["track_id"] == tid) & labeled["label"].notna()]
        for label, part in t.groupby("label"):
            ax.plot(
                part["lon"], part["lat"], ".", ms=2, color=colors[label], label=label
            )
    for code, (lat, lon, _) in AIRPORTS.items():
        ax.plot(lon, lat, "k^", ms=5)
        ax.annotate(code, (lon, lat), fontsize=7)
    handles, names = ax.get_legend_handles_labels()
    unique = dict(zip(names, handles, strict=True))
    ax.legend(unique.values(), unique.keys(), fontsize=8)
    ax.set_title("40 random labeled tracks (spot-check the labels)")
    fig.tight_layout()
    samples_png = path.with_name("phase_label_samples.png")
    fig.savefig(samples_png, dpi=110)
    plt.close(fig)

    cm = confusion_matrix(y_test, best.predictions, labels=CLASSES)
    p, r, f, s = precision_recall_fscore_support(
        y_test, best.predictions, labels=CLASSES, zero_division=0
    )
    lines = [
        "# Arrival/departure classifier: evaluation",
        "",
        f"Positions in the track log: {coverage['positions']:,}; labeled: {coverage['labeled']:,}.",
        "Label counts (None = unlabeled, dropped): "
        + ", ".join(f"{k}: {v:,}" for k, v in coverage["by_label"].items()),
        "",
        f"Held out the last {metrics['heldout_days']} day(s): {metrics['test_samples']:,} samples; "
        f"trained on {metrics['train_samples']:,}.",
        "",
        "| Model | Macro-F1 | Accuracy |",
        "|---|---|---|",
        *[f"| {x.name} | {x.macro_f1:.3f} | {x.accuracy:.3f} |" for x in ev["results"]],
        "",
        f"Per class for {best.name}:",
        "",
        "| Class | Precision | Recall | F1 | Samples |",
        "|---|---|---|---|---|",
        *[
            f"| {c} | {p[i]:.3f} | {r[i]:.3f} | {f[i]:.3f} | {s[i]} |"
            for i, c in enumerate(CLASSES)
        ],
        "",
        "Confusion matrix (rows = true, columns = predicted): " + ", ".join(CLASSES),
        "",
        "```",
        *["  ".join(f"{v:7d}" for v in row) for row in cm],
        "```",
        "",
        (
            f"**Shipped:** {best.name}, macro-F1 {best.macro_f1:.3f} vs "
            f"{ev['results'][0].macro_f1:.3f} for the current rules."
            if ev["ships"]
            else "**Not shipped:** no model beat the current rules on held-out days."
        ),
        "",
        f"![Label spot-check]({samples_png.name})",
        "",
    ]
    path.write_text("\n".join(lines))
