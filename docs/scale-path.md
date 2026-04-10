# Scale Path for Ingestion + Realtime Pipeline (Phase 3)

Source issue: `#4`

This is the canonical Phase 3 implementation summary and operating contract.

## Goals

- Remove single-node ingestion bottlenecks
- Make failover predictable and testable
- Define safe throughput envelopes for Supabase realtime fanout

## What is already implemented

### 1) Architecture decision: queue/retry/idempotency
- ADR: `docs/adr/0001-ingestor-scale-failover.md`
- Decision highlights:
  - Queue-first decomposition of ingest work
  - Bounded retry with exponential backoff + dead-letter path
  - Deterministic idempotency keys for replay-safe upserts
  - Leader semantics for current-state reconciliation

### 2) Failover path implementation
- Script: `scripts/test-ingestor-failover.sh`
- Command: `npm run ops:failover-drill -- <systemd-service-name>`
- Contract:
  - Verifies service is active
  - Kills primary process
  - Confirms service restart within timeout
  - Captures journal output for drill evidence

### 3) Throughput constraints + measurement baseline
- Baseline and method: `docs/realtime-throughput-baseline.md`
- Evidence template: `docs/evidence/realtime-throughput-template.md`
- Current guardrails include:
  - `flights_current` writes/minute targets and hard thresholds
  - Subscriber fanout budget
  - p50/p95/p99 event lag envelopes

### 4) Realtime fanout guardrails and overload policy
- Guardrails doc: `docs/phase-3-realtime-fanout-guardrails.md`
- Includes:
  - topic partitioning rules
  - stale connection cleanup limits
  - degradation modes under saturation
  - trigger thresholds for capacity alarms

## Remaining operational cadence

Use this cadence to keep Phase 3 healthy:

1. Run failover drill at least once per release cycle.
2. Capture realtime throughput evidence for each release candidate.
3. Re-tune thresholds when sustained load changes materially.

## Exit criteria status

- [x] Architecture decision record committed
- [x] At least one failover path implemented
- [x] Throughput constraints documented with repeatable measurement
