# Phase 3 — Scale Path for Ingestion + Realtime (Issue #4)

Goal: increase ingestion and realtime capacity without destabilizing reliability controls.

## Slice plan (32k-safe)

### Slice A — Ingestion throughput profiling baseline
Status: completed in prior cycle.

### Slice B — Queue/backpressure strategy
Status: completed in prior cycle.

### Slice C — Realtime fanout guardrails ✅
Status: completed in this cycle.

Deliverables:
- Channel partitioning policy and naming convention
- Subscriber caps and stale-connection cleanup
- Saturation fallback behavior and degrade modes
- Capacity thresholds tied to warning/critical runbook actions

### Slice D — Capacity alarms + canary rollout ✅
Status: completed in this cycle.

Deliverables:
- Capacity alert thresholds (queue depth, cycle lag, fanout delay)
- Canary rollout checklist + rollback triggers
- Dashboard/ops visibility checklist for rollout windows
- Delivered in `docs/phase-3-capacity-canary-rollout.md`

## Execution order
1. Slice A (measure before changing behavior)
2. Slice B (ingestion stability)
3. Slice C (realtime stability)
4. Slice D (safe rollout + alerting)

## Current cycle action
- Delivered: Slice D canary rollout + alert threshold runbook (`docs/phase-3-capacity-canary-rollout.md`).
- Next: convert Slice D runbook into alert manifests/dashboard checks in implementation PR.
