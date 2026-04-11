# ADR 0002: Single-Pi ingestor risk matrix + recommended scale topology

- Status: Accepted
- Date: 2026-04-11
- Related issues: #26 (slice), #4 (phase parent)

## Context

TrackFlights ingestion currently relies on one Raspberry Pi worker for provider polling, normalization, and write fan-in. This is efficient, but it concentrates failure modes on one host and one process path.

## Bottleneck and failure matrix

| Risk area | Current bottleneck/failure mode | Blast radius | Mitigation | Residual risk |
|---|---|---|---|---|
| CPU saturation | High-volume provider windows push poll/parse cycle over target interval | Data freshness drifts globally; late updates | Queue split by provider+airport; enforce per-job budget; cycle lag alerts | Medium |
| Memory pressure/OOM | Burst payload + retries increase resident memory and crash worker | Full ingest outage until restart | Hard memory limits, bounded batch size, restart watchdog, dead-letter overflow path | Medium |
| I/O contention | SQLite/file/journal pressure on single node during snapshots/logging | Slower commits + backlog growth | Move high-churn telemetry off critical path; tune fsync strategy; keep snapshot cadence bounded | Medium |
| Process crash | Worker exception or host reboot | Ingest pauses entirely | systemd auto-restart, liveness checks, failover drill with evidence | Low/Medium |
| Duplicate execution | Manual restart race / multi-instance overlap | Duplicate writes, noisy alerts, inconsistent state | Deterministic idempotency key + upsert boundary + side-effect dedupe keys | Low |
| Upstream API flakiness | Provider 5xx/rate limits cause repeated retries | Backlog amplification and lag | Exponential backoff + max attempts + DLQ triage | Medium |
| Host-level outage | Power/network/storage failure on single Pi | Complete ingest blackout | Standby worker cutover runbook + periodic promotion drill | Medium |

## Decision

Adopt a **queue-first, multi-worker fetch + single-leader reconcile** topology:

1. Multiple workers handle fetch/normalize jobs from queue partitions.
2. A single leader process performs current-state reconciliation writes.
3. Standby leader can be promoted through documented cutover runbook.
4. Retry and dead-letter handling remain bounded and observable.
5. Idempotency keys gate all writes and outbound side effects.

## Why this topology

- Preserves data integrity (single writer) while scaling ingestion throughput (multi-worker fetch).
- Keeps failover operationally simple for a small team.
- Fits existing TrackFlights phase-3 docs and can be rolled out slice-by-slice.

## Trade-offs

- Adds queue + lease visibility requirements.
- Requires a disciplined process for promoting leaders.
- Slightly slower feature velocity while observability hardening is finalized.

## Implementation notes

- Keep queue schema deterministic and replay-safe.
- Treat dead-letter depth as a paging signal when threshold exceeded.
- Run quarterly failover drill and attach evidence under `docs/evidence/`.

## Consequences

- Throughput can scale horizontally without losing write correctness.
- Failure recovery becomes predictable and testable.
- Additional ops overhead is accepted to reduce single-node blast radius.
