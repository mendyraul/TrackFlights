# Phase 3 Slice D1 — Capacity Metrics Plumbing (Issue #4)

This slice wires capacity signals into the ingestor cycle so alerting can trip on hard thresholds before user-visible degradation.

## Added signals

Per poll cycle (`apps/ingestor/src/worker/poller.py`):

- `cycle_duration_seconds`
- `cycle_lag_seconds` (`max(0, cycle_duration - poll_interval)`)
- `queue_depth` (optional producer/consumer backlog key)
- `retry_ratio` (`retries / processed_jobs`)
- `fanout_p95_ms` (optional realtime signal)
- `churn_ratio` (`(new + updated + removed_from_api) / normalized`)

## Thresholds (env-configurable via settings)

- `capacity_cycle_lag_warn_seconds` (default `15.0`)
- `capacity_queue_depth_warn` (default `2000`)
- `capacity_retry_ratio_warn` (default `0.2`)
- `capacity_fanout_p95_warn_ms` (default `1500`)
- `capacity_churn_ratio_warn` (default `0.35`)

## Alert behavior

If any threshold breaches in a cycle, ingestor emits:

- `logger.warning("Capacity threshold exceeded", breaches=[...], ...)`

This is intentionally log-first so downstream alert transports can be layered without changing core ingestion flow.

## Follow-up slices

- D2: persist capacity snapshots in Supabase for dashboard trend lines
- D3: wire warning logs to pager/notification policy
