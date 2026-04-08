from src.worker.capacity import CapacityThresholds, build_capacity_snapshot, evaluate_capacity


def test_build_capacity_snapshot_defaults_missing_optional_keys() -> None:
    snapshot = build_capacity_snapshot(
        {
            "normalized": 10,
            "new": 2,
            "updated": 1,
            "removed_from_api": 1,
        },
        cycle_duration_seconds=63.2,
        poll_interval_seconds=60,
    )

    assert snapshot.cycle_lag_seconds == 3.2
    assert snapshot.queue_depth == 0
    assert snapshot.retry_ratio == 0.0
    assert snapshot.fanout_p95_ms == 0
    assert snapshot.churn_ratio == 0.4


def test_evaluate_capacity_breaches() -> None:
    snapshot = build_capacity_snapshot(
        {
            "normalized": 20,
            "new": 3,
            "updated": 3,
            "removed_from_api": 2,
            "queue_depth": 2500,
            "retries": 12,
            "processed_jobs": 40,
            "fanout_p95_ms": 2200,
        },
        cycle_duration_seconds=95,
        poll_interval_seconds=60,
    )

    breaches = evaluate_capacity(
        snapshot,
        CapacityThresholds(
            cycle_lag_warn_seconds=15,
            queue_depth_warn=2000,
            retry_ratio_warn=0.2,
            fanout_p95_warn_ms=1500,
            churn_ratio_warn=0.3,
        ),
    )

    assert breaches == {
        "cycle_lag": True,
        "queue_depth": True,
        "retry_ratio": True,
        "fanout_p95": True,
        "churn_ratio": True,
    }
