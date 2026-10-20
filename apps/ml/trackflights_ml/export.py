"""Export trained scikit-learn models to the tracker's JSON model format.

The Pi evaluates these with apps/ingestor/src/ml/model_json.py, so only model
types that evaluator understands are supported:

  * linear: LinearRegression, Ridge, LogisticRegression, optionally inside a
    Pipeline after a StandardScaler (the scaler's mean/scale are exported);
  * trees: GradientBoostingRegressor, GradientBoostingClassifier;
  * tree: DecisionTreeRegressor, DecisionTreeClassifier.

Anything else raises, rather than exporting something the Pi can't run.
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression, Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from src.ml.model_json import FORMAT


def export_model(
    estimator: Any,
    *,
    name: str,
    features: list[str],
    metrics: dict[str, Any] | None = None,
    version: str | None = None,
) -> dict[str, Any]:
    scaler, model = _unwrap(estimator)
    is_classifier = hasattr(model, "classes_")
    spec: dict[str, Any] = {
        "format": FORMAT,
        "name": name,
        "version": version or datetime.now(UTC).strftime("%Y-%m-%dT%H%MZ"),
        "kind": "classifier" if is_classifier else "regressor",
        "features": list(features),
        "metrics": metrics or {},
    }
    if is_classifier:
        spec["classes"] = [str(c) for c in model.classes_]

    n_features = getattr(model, "n_features_in_", len(features))
    if n_features != len(features):
        raise ValueError(f"model has {n_features} features, got {len(features)} names")

    if isinstance(model, LinearRegression | Ridge | LogisticRegression):
        spec["model"] = _linear(model, scaler)
    elif isinstance(model, GradientBoostingRegressor | GradientBoostingClassifier):
        _no_scaler(scaler, model)
        spec["model"] = _boosted(model, n_features)
    elif isinstance(model, DecisionTreeRegressor | DecisionTreeClassifier):
        _no_scaler(scaler, model)
        spec["model"] = {"type": "tree", "tree": _tree(model, is_classifier)}
    else:
        raise TypeError(f"can't export {type(model).__name__}")
    return spec


def save_model(spec: dict[str, Any], path: str | Path) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(spec, f, indent=1)
        f.write("\n")


# ── Model types ─────────────────────────────────────────────────────────


def _unwrap(estimator: Any) -> tuple[StandardScaler | None, Any]:
    if not isinstance(estimator, Pipeline):
        return None, estimator
    steps = [step for _, step in estimator.steps]
    if len(steps) == 1:
        return None, steps[0]
    if len(steps) == 2 and isinstance(steps[0], StandardScaler):
        return steps[0], steps[1]
    raise TypeError("only Pipeline(StandardScaler, model) is supported")


def _no_scaler(scaler: StandardScaler | None, model: Any) -> None:
    if scaler is not None:
        raise TypeError(f"{type(model).__name__} doesn't need a scaler; export it bare")


def _linear(model: Any, scaler: StandardScaler | None) -> dict[str, Any]:
    coef = np.atleast_2d(model.coef_)
    intercept = np.atleast_1d(model.intercept_)
    spec: dict[str, Any] = {
        "type": "linear",
        "coef": coef.tolist(),
        "intercept": intercept.tolist(),
    }
    if scaler is not None:
        spec["mean"] = scaler.mean_.tolist()
        spec["scale"] = scaler.scale_.tolist()
    return spec


def _boosted(model: Any, n_features: int) -> dict[str, Any]:
    # The initial raw score (mean for regression, log-odds / log-prior for
    # classification) is what the boosted trees add to.
    init = model._raw_predict_init(np.zeros((1, n_features)))[0]
    return {
        "type": "trees",
        "init": [float(v) for v in np.atleast_1d(init)],
        "learning_rate": float(model.learning_rate),
        "stages": [
            [_tree(est, classifier=False) for est in stage]
            for stage in model.estimators_
        ],
    }


def _tree(model: Any, classifier: bool) -> dict[str, Any]:
    t = model.tree_
    if classifier:
        values = [[float(v) for v in node[0]] for node in t.value]
    else:
        values = [[float(node[0][0])] for node in t.value]
    return {
        "feature": [int(f) for f in t.feature],
        "threshold": [float(v) for v in t.threshold],
        "left": [int(v) for v in t.children_left],
        "right": [int(v) for v in t.children_right],
        "value": values,
    }
