# Phase 3 — Scale Path for Ingestion + Realtime (Issue #4)

Goal: increase ingestion and realtime capacity without destabilizing reliability controls.

## Slice plan (32k-safe)

### Slice A — Ingestion throughput profiling baseline
Status: completed in prior cycle (baseline profiling/decomposition delivered).

### Slice B — Queue/backpressure strategy ✅
Status: completed in prior cycle.

Deliverable:
- `docs/phase-3-queue-retry-idempotency.md`

### Slice C — Realtime fanout guardrails ✅
Status: completed in this cycle.

Deliverable:
- `docs/phase-3-realtime-fanout-guardrails.md`

### Slice D — Capacity alarms + canary rollout
Deliverables:
- Capacity alert thresholds (queue depth, cycle lag, fanout delay)
- Canary rollout checklist + rollback triggers

## Execution order
1. Slice A (measure before changing behavior)
2. Slice B (ingestion stability)
3. Slice C (realtime stability)
4. Slice D (safe rollout + alerting)

## Current cycle action
- Delivered: Slice D capacity alarm thresholds and canary/rollback runbook.
- Next: open PR for Slice C + D package, then execute D1 metrics plumbing implementation.
