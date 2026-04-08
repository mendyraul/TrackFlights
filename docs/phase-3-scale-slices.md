# Phase 3 — Scale Path for Ingestion + Realtime (Issue #4)

Goal: increase ingestion and realtime capacity without destabilizing reliability controls.

## Slice plan (32k-safe)

### Slice A — Ingestion throughput profiling baseline ✅
Status: completed in prior cycle.

### Slice B — Queue/backpressure strategy ✅
Status: completed.
Deliverable:
- `docs/phase-3-queue-retry-idempotency.md`

### Slice C — Realtime fanout guardrails ✅
Status: completed.
Deliverables:
- `docs/phase-3-realtime-fanout-guardrails.md`
- Channel partitioning and naming policy
- Subscriber caps + stale cleanup policy
- Saturation fallback behavior and degrade modes

### Slice D — Capacity alarms + canary rollout ✅
Status: completed (with D1 metrics plumbing).
Deliverables:
- Capacity alert thresholds (queue depth, cycle lag, fanout delay)
- Canary rollout checklist + rollback triggers
- `docs/phase-3-capacity-canary-rollout.md`
- D1 metrics plumbing implementation (`apps/ingestor/src/worker/capacity.py`)

## Execution order
1. Slice A (measure before changing behavior)
2. Slice B (ingestion stability)
3. Slice C (realtime stability)
4. Slice D (safe rollout + alerting)

## Current cycle action
- Delivered: Slice C/D docs and runbooks.
- Delivered: Slice D1 metrics plumbing + threshold evaluator + unit tests.
- Next: persist snapshots to Supabase for trend dashboarding.
