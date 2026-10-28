"""The Pi's JSON evaluator must agree with scikit-learn on every exported model."""

import json

import numpy as np
import pytest
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.linear_model import LinearRegression, LogisticRegression, Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from trackflights_ml.export import export_model, save_model
from src.ml.model_json import JsonModel

FEATURES = ["a", "b", "c", "d"]
rng = np.random.default_rng(7)
X = rng.normal(size=(400, 4)) * [1.0, 10.0, 0.1, 100.0]
y_reg = (
    3 * X[:, 0]
    - 0.2 * X[:, 1]
    + 50 * X[:, 2] ** 2
    + 0.01 * X[:, 3]
    + rng.normal(size=400)
)
y_bin = np.where(X[:, 0] + 0.1 * X[:, 1] > 0, "dep", "arr")
y_multi = np.select(
    [X[:, 0] > 0.5, X[:, 0] < -0.5], ["arriving", "departing"], "overflight"
)
X_test = rng.normal(size=(200, 4)) * [1.0, 10.0, 0.1, 100.0]


def rows(x):
    return [dict(zip(FEATURES, r, strict=True)) for r in x]


def roundtrip(spec, tmp_path):
    """Save and load through JSON, exactly as the Pi will read it."""
    path = tmp_path / "m.json"
    save_model(spec, path)
    return JsonModel.load(path)


REGRESSORS = [
    LinearRegression(),
    make_pipeline(StandardScaler(), Ridge(alpha=1.0)),
    DecisionTreeRegressor(max_depth=5, random_state=0),
    GradientBoostingRegressor(n_estimators=60, max_depth=3, random_state=0),
]


@pytest.mark.parametrize("est", REGRESSORS, ids=lambda e: type(e).__name__)
def test_regressor_parity(est, tmp_path):
    est.fit(X, y_reg)
    model = roundtrip(export_model(est, name="r", features=FEATURES), tmp_path)
    expected = est.predict(X_test)
    got = [model.predict(r) for r in rows(X_test)]
    np.testing.assert_allclose(got, expected, rtol=0, atol=1e-9)


CLASSIFIERS = [
    (make_pipeline(StandardScaler(), LogisticRegression(max_iter=500)), y_bin),
    (make_pipeline(StandardScaler(), LogisticRegression(max_iter=500)), y_multi),
    (DecisionTreeClassifier(max_depth=4, random_state=0), y_multi),
    (GradientBoostingClassifier(n_estimators=40, max_depth=2, random_state=0), y_bin),
    (GradientBoostingClassifier(n_estimators=40, max_depth=2, random_state=0), y_multi),
]


@pytest.mark.parametrize(
    "est,y",
    CLASSIFIERS,
    ids=["logreg-binary", "logreg-multi", "tree-multi", "gbm-binary", "gbm-multi"],
)
def test_classifier_parity(est, y, tmp_path):
    est.fit(X, y)
    model = roundtrip(export_model(est, name="c", features=FEATURES), tmp_path)
    assert model.classes == [str(c) for c in est.classes_]

    expected = est.predict_proba(X_test)
    got = [[model.predict_proba(r)[c] for c in model.classes] for r in rows(X_test)]
    np.testing.assert_allclose(got, expected, rtol=0, atol=1e-9)
    assert [model.predict_label(r) for r in rows(X_test)] == list(est.predict(X_test))


def test_tree_split_exactly_at_threshold_matches_sklearn(tmp_path):
    # Values sitting on a split point are where float32 vs float64 differ.
    est = DecisionTreeRegressor(max_depth=3, random_state=0).fit(X, y_reg)
    model = roundtrip(export_model(est, name="r", features=FEATURES), tmp_path)
    t = est.tree_
    probes = []
    for node in range(t.node_count):
        if t.feature[node] >= 0:
            # On the threshold, and one float64 step either side of it: a
            # float64 comparison and scikit-learn's float32 one can disagree.
            for v in (
                t.threshold[node],
                np.nextafter(t.threshold[node], np.inf),
                np.nextafter(t.threshold[node], -np.inf),
            ):
                x = X_test[0].copy()
                x[t.feature[node]] = v
                probes.append(x)
    probes = np.array(probes)
    np.testing.assert_allclose(
        [model.predict(r) for r in rows(probes)], est.predict(probes), rtol=0, atol=1e-9
    )


def test_metadata_and_refusals():
    est = LinearRegression().fit(X, y_reg)
    spec = export_model(
        est, name="traffic-forecast", features=FEATURES, metrics={"mae": 1.2}
    )
    assert spec["name"] == "traffic-forecast" and spec["kind"] == "regressor"
    assert spec["metrics"] == {"mae": 1.2}
    json.dumps(spec)  # plain JSON, no numpy types

    with pytest.raises(ValueError):
        export_model(est, name="x", features=["a"])  # wrong feature count
    with pytest.raises(TypeError):
        export_model(
            make_pipeline(StandardScaler(), DecisionTreeRegressor()).fit(X, y_reg),
            name="x",
            features=FEATURES,
        )
