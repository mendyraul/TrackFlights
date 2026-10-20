"""Evaluate models exported by apps/ml as JSON, without scikit-learn.

Models are trained on a laptop (apps/ml) and shipped to the Pi as small JSON
files, so the Pi needs no numpy/scikit-learn and the model is readable in a
code review. Supported shapes (all produced by apps/ml/trackflights_ml/export.py):

  linear:  y = intercept + coef . ((x - mean) / scale)
           classifier: one row of coef per class, softmax (one row: sigmoid)
  trees:   gradient boosting, raw = init + learning_rate * sum(tree(x));
           regressor returns raw, classifier applies softmax / sigmoid
  tree:    a single decision tree; regressor value, or class-count leaf
           normalized to probabilities

Each tree is stored as parallel arrays (scikit-learn's tree_ layout):
feature[i] < 0 marks a leaf; otherwise go left when x[feature] <= threshold.
"""

import json
import math
from pathlib import Path
from typing import Any

FORMAT = "trackflights-model/1"


class JsonModel:
    def __init__(self, spec: dict[str, Any]) -> None:
        if spec.get("format") != FORMAT:
            raise ValueError(f"unsupported model format: {spec.get('format')!r}")
        self.spec = spec
        self.name: str = spec["name"]
        self.version: str = spec["version"]
        self.kind: str = spec["kind"]  # "regressor" | "classifier"
        self.features: list[str] = spec["features"]
        self.classes: list[str] = spec.get("classes", [])
        self.metrics: dict[str, Any] = spec.get("metrics", {})
        self._model = spec["model"]

    @classmethod
    def load(cls, path: str | Path) -> "JsonModel":
        with open(path) as f:
            return cls(json.load(f))

    # ── Public API ──────────────────────────────────────────────────────

    def predict(self, features: dict[str, float]) -> float:
        """Regressor output."""
        if self.kind != "regressor":
            raise TypeError("predict() is for regressors; use predict_proba()")
        raw = self._raw(self._vector(features))
        return raw[0]

    def predict_proba(self, features: dict[str, float]) -> dict[str, float]:
        """Classifier probabilities by class name."""
        if self.kind != "classifier":
            raise TypeError("predict_proba() is for classifiers")
        x = self._vector(features)
        m = self._model
        if m["type"] == "tree":
            counts = _tree_value(m["tree"], x)
            total = sum(counts)
            probs = [c / total for c in counts]
        else:
            raw = self._raw(x)
            probs = _sigmoid_pair(raw[0]) if len(raw) == 1 else _softmax(raw)
        return dict(zip(self.classes, probs, strict=True))

    def predict_label(self, features: dict[str, float]) -> str:
        probs = self.predict_proba(features)
        return max(probs, key=lambda k: probs[k])

    # ── Internals ───────────────────────────────────────────────────────

    def _vector(self, features: dict[str, float]) -> list[float]:
        missing = [name for name in self.features if name not in features]
        if missing:
            raise KeyError(f"missing features: {missing}")
        return [float(features[name]) for name in self.features]

    def _raw(self, x: list[float]) -> list[float]:
        """Raw score(s): one value for regressors/binary, one per class otherwise."""
        m = self._model
        kind = m["type"]
        if kind == "linear":
            mean = m.get("mean") or [0.0] * len(x)
            scale = m.get("scale") or [1.0] * len(x)
            z = [(xi - mu) / s for xi, mu, s in zip(x, mean, scale, strict=True)]
            return [
                b + sum(w * zi for w, zi in zip(row, z, strict=True))
                for row, b in zip(m["coef"], m["intercept"], strict=True)
            ]
        if kind == "trees":
            raw = list(m["init"])
            lr = m["learning_rate"]
            for stage in m["stages"]:
                for k, tree in enumerate(stage):
                    raw[k] += lr * _tree_value(tree, x)[0]
            return raw
        if kind == "tree":
            return _tree_value(m["tree"], x)
        raise ValueError(f"unknown model type {kind!r}")


def _tree_value(tree: dict[str, list], x: list[float]) -> list[float]:
    node = 0
    feature, threshold = tree["feature"], tree["threshold"]
    left, right = tree["left"], tree["right"]
    while feature[node] >= 0:
        node = left[node] if x[feature[node]] <= threshold[node] else right[node]
    return tree["value"][node]


def _softmax(raw: list[float]) -> list[float]:
    top = max(raw)
    exps = [math.exp(r - top) for r in raw]
    total = sum(exps)
    return [e / total for e in exps]


def _sigmoid_pair(raw: float) -> list[float]:
    p = 1.0 / (1.0 + math.exp(-raw))
    return [1.0 - p, p]
