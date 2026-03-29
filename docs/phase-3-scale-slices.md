# Phase 3 — Scale Path for Ingestion + Realtime (Issue #4)

Goal: increase ingestion and realtime capacity without destabilizing reliability controls.

## Slice plan (32k-safe)

### Slice A — Ingestion throughput profiling baseline ✅
Status: completed in prior cycle (baseline profiling and decomposition delivered).

### Slice B — Queue/backpressure strategy ✅
Deliverable:
- `docs/phase-3-queue-retry-idempotency.md`

### Slice C — Realtime fanout guardrails ✅
Deliverables:
- Channel/topic partitioning policy
- Connection limits and stale-subscriber cleanup policy
- Saturation fallback behavior

### Slice D — Capacity alarms + canary rollout (in progress)
Deliverables:
- Capacity alert thresholds (queue depth, cycle lag, fanout delay)
- Canary rollout checklist + rollback triggers
- D1 metrics plumbing implementation (`apps/ingestor/src/worker/capacity.py`) ✅

## Execution order
1. Slice A (measure before changing behavior)
2. Slice B (ingestion stability)
3. Slice C (realtime stability)
4. Slice D (safe rollout + alerting)

## Current cycle action
- Delivered: Slice D1 metrics plumbing + threshold evaluator + unit tests.
- Next: D2 persist snapshots to Supabase for trend dashboarding.
