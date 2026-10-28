"""JSON model evaluator: hand-built models with known outputs."""

import pytest
from src.ml.model_json import FORMAT, JsonModel

TREE = {  # x0 <= 5 -> 1.0 else 3.0
    "feature": [0, -2, -2],
    "threshold": [5.0, 0, 0],
    "left": [1, -1, -1],
    "right": [2, -1, -1],
    "value": [[0.0], [1.0], [3.0]],
}


def spec(kind, model, classes=None):
    s = {
        "format": FORMAT,
        "name": "t",
        "version": "1",
        "kind": kind,
        "features": ["a", "b"],
        "model": model,
    }
    if classes:
        s["classes"] = classes
    return s


def test_linear_regressor_with_scaling():
    m = JsonModel(
        spec(
            "regressor",
            {
                "type": "linear",
                "coef": [[2.0, -1.0]],
                "intercept": [0.5],
                "mean": [1.0, 0.0],
                "scale": [2.0, 1.0],
            },
        )
    )
    assert m.predict({"a": 5.0, "b": 1.0}) == pytest.approx(0.5 + 2 * 2.0 - 1.0)


def test_boosted_trees_regressor():
    m = JsonModel(
        spec(
            "regressor",
            {"type": "trees", "init": [10.0], "learning_rate": 0.5, "stages": [[TREE], [TREE]]},
        )
    )
    assert m.predict({"a": 7, "b": 0}) == pytest.approx(10 + 0.5 * 3 + 0.5 * 3)


def test_classifier_softmax_and_tree_counts():
    lin = JsonModel(
        spec(
            "classifier",
            {"type": "linear", "coef": [[0, 0], [0, 0]], "intercept": [0.0, 0.0]},
            ["x", "y"],
        )
    )
    assert lin.predict_proba({"a": 1, "b": 2}) == {"x": 0.5, "y": 0.5}
    tree = {**TREE, "value": [[0, 0], [3, 1], [0, 4]]}
    t = JsonModel(spec("classifier", {"type": "tree", "tree": tree}, ["arr", "dep"]))
    assert t.predict_proba({"a": 1, "b": 0}) == {"arr": 0.75, "dep": 0.25}
    assert t.predict_label({"a": 9, "b": 0}) == "dep"


def test_rejects_missing_features_and_unknown_format():
    m = JsonModel(spec("regressor", {"type": "linear", "coef": [[1, 1]], "intercept": [0]}))
    with pytest.raises(KeyError):
        m.predict({"a": 1})
    with pytest.raises(ValueError):
        JsonModel({**spec("regressor", {}), "format": "other"})
