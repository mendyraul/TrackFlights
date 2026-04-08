"""Capacity metrics helpers for poll-cycle observability and alerting."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CapacitySnapshot:
    cycle_duration_seconds: float
    cycle_lag_seconds: float
    queue_depth: int
    retry_ratio: float
    fanout_p95_ms: int
    churn_ratio: float


@dataclass(frozen=True)
class CapacityThresholds:
    cycle_lag_warn_seconds: float
    queue_depth_warn: int
    retry_ratio_warn: float
    fanout_p95_warn_ms: int
    churn_ratio_warn: float


def build_capacity_snapshot(stats: dict[str, int], cycle_duration_seconds: float, poll_interval_seconds: int) -> CapacitySnapshot:
    """Build a normalized capacity snapshot from poll stats.

    Stats keys are optional to allow gradual rollout while queue/fanout metrics
    are phased in.
    """
    normalized = max(1, int(stats.get("normalized", 0)))
    churn_count = int(stats.get("new", 0)) + int(stats.get("updated", 0)) + int(stats.get("removed_from_api", 0))
    retries = int(stats.get("retries", 0))
    processed_jobs = max(1, int(stats.get("processed_jobs", normalized)))

    return CapacitySnapshot(
        cycle_duration_seconds=round(cycle_duration_seconds, 3),
        cycle_lag_seconds=round(max(0.0, cycle_duration_seconds - poll_interval_seconds), 3),
        queue_depth=int(stats.get("queue_depth", 0)),
        retry_ratio=round(retries / processed_jobs, 4),
        fanout_p95_ms=int(stats.get("fanout_p95_ms", 0)),
        churn_ratio=round(churn_count / normalized, 4),
    )


def evaluate_capacity(snapshot: CapacitySnapshot, thresholds: CapacityThresholds) -> dict[str, bool]:
    """Return per-signal breach map for alert routing."""
    return {
        "cycle_lag": snapshot.cycle_lag_seconds >= thresholds.cycle_lag_warn_seconds,
        "queue_depth": snapshot.queue_depth >= thresholds.queue_depth_warn,
        "retry_ratio": snapshot.retry_ratio >= thresholds.retry_ratio_warn,
        "fanout_p95": snapshot.fanout_p95_ms >= thresholds.fanout_p95_warn_ms,
        "churn_ratio": snapshot.churn_ratio >= thresholds.churn_ratio_warn,
    }
