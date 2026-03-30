# ADR 0001: Ingestor scale + failover strategy

- Status: Accepted
- Date: 2026-03-28
- Related issue: #4 (Phase 3)

## Context

Current ingestion is effectively single-worker and single-host. That creates risk in three areas:

1. A worker crash can pause updates until manual intervention.
2. Increasing provider volume can exceed one cycle's budget.
3. Duplicate worker execution can race writes unless idempotency is explicit.

## Decision

Adopt a staged scale path with clear safety boundaries:

1. **Queue-first ingest decomposition**
   - Break ingestion into small airport/provider jobs.
   - Keep a pull-based queue contract (visibility timeout, lease extension, retries).

2. **Bounded retry policy**
   - Retry transient failures with exponential backoff (e.g., 15s, 30s, 60s, 120s, 300s).
   - After max attempts, route job to dead-letter queue for operator triage.

3. **Idempotent write boundary**
   - Use deterministic idempotency key:
     - `provider + airport + flight_iata + observed_at_bucket`
   - Upserts must be safe to replay.
   - Side effects (alerts/notifications) must record a de-dup key before emit.

4. **Leader semantics for current-state materialization**
   - Allow multiple workers for fetch/normalize work.
   - Restrict current-state reconciliation (final write/archival pass) to one leader.
   - If leader is lost, standby can be promoted via failover drill/runbook.

5. **Operational failover baseline**
   - Maintain validated local failover drill (systemd restart validation).
   - Capture evidence from each drill in `docs/evidence/`.

## Consequences

### Positive
- Crash recovery becomes measurable and testable.
- Throughput can increase by adding workers without unsafe duplicate writes.
- Clear dead-letter path avoids silent data loss.

### Trade-offs
- Additional queue and retry telemetry required.
- Leader election/cutover adds operational complexity.
- Must maintain evidence discipline for failover drills.

## Follow-up slices

- Slice 3: document throughput assumptions and measured constraints.
- Slice 4: implement secondary worker cutover runbook and verification checklist.
