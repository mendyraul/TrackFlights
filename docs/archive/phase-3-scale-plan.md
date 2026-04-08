# Phase 3 — Scale path for ingestion + realtime pipeline (Issue #4)

Sage-style decomposition into small slices that fit local 32k context execution.

## Slice 1: ADR + queue/retry/idempotency baseline ✅
- Added architecture decision record for ingestion scaling path:
  - pull-based job queue for airport/provider slices
  - retry policy with bounded exponential backoff + dead-letter path
  - idempotency key strategy at write boundaries
  - single-writer leader semantics for current-state materialization
- Deliverable: `docs/adr/0001-ingestor-scale-failover.md`

## Slice 2: Failover path implementation/test drill ✅
- Added one-command failover drill for systemd-managed ingestor:
  - verify service is active
  - send `SIGKILL` to main process
  - confirm systemd restarts service within timeout
  - capture journal excerpt as evidence
- Deliverable: `scripts/test-ingestor-failover.sh`
- NPM shortcut: `npm run ops:failover-drill`

## Slice 3: Realtime throughput assumptions + measurement ✅
- Documented baseline throughput assumptions for Supabase realtime:
  - writes/min budget for `flights_current`
  - subscription fanout expectations
  - acceptable event lag envelope
- Added repeatable measurement recipe and evidence template.
- Deliverables:
  - `docs/realtime-throughput-baseline.md`
  - `docs/evidence/realtime-throughput-template.md`

## Slice 4: Secondary worker/container cutover runbook (next)
- Add explicit cutover steps for promoting a standby worker when primary host fails.
- Include health checks, rollback, and ownership.

## Exit criteria for Phase 3
- Architecture decision record committed ✅
- At least one failover path implemented or tested ✅
- Throughput constraints measured and documented ✅ (Slice 3)
