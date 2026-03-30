"""Operational self-check snapshot for TrackFlights ingestor."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from src.config import get_runtime_config_summary, validate_runtime_settings


def build_health_snapshot() -> dict[str, object]:
    """Return a machine-readable ingestor self-check payload."""
    summary = get_runtime_config_summary()

    validation_error = None
    try:
        validate_runtime_settings()
    except ValueError as exc:  # pragma: no cover - exercised by CLI path
        validation_error = str(exc)

    poll_interval = int(summary["poll_interval_seconds"])
    heartbeat_miss_threshold_seconds = poll_interval * 2

    return {
        "service": "ingestor",
        "status": "ok" if validation_error is None else "fail",
        "generated_at": datetime.now(UTC).isoformat(),
        "runtime_config_valid": validation_error is None,
        "heartbeat_miss_threshold_seconds": heartbeat_miss_threshold_seconds,
        "config": summary,
        "validation_error": validation_error,
    }


def main() -> int:
    payload = build_health_snapshot()
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload["runtime_config_valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
