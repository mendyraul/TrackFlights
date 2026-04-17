# Supabase Realtime Throughput Baseline + Limits (Phase 3 / Slice D)

Owner: Rico  
Issue: `#29` (parent `#4`)

## Objective
Define a repeatable, evidence-backed throughput baseline for realtime updates and establish clear scale-up trigger thresholds.

## Baseline assumptions

### Write throughput (`flights_current` upserts)
- Target sustained load: `<= 2,000 updates/min`
- Burst tolerance (short spikes): `<= 3,500 updates/min` for up to 5 minutes
- Scale-up trigger: `> 4,000 updates/min` for 2+ consecutive minutes

### Realtime fanout (subscribers)
- Target concurrent subscribers: `<= 500`
- Regional/channel soft cap: `<= 150`
- Scale-up trigger: `> 750` concurrent subscribers or sustained reconnect churn

### Event propagation lag (DB write -> client receive)
- p50 target: `<= 800 ms`
- p95 target: `<= 2,000 ms`
- p99 target: `<= 4,000 ms`
- Scale-up trigger: p95 `> 4,000 ms` for 10+ minutes

## Measurement protocol (repeatable)

Run this before release and after significant ingestion/realtime changes.

1. Capture environment metadata
   - branch name, commit SHA, deployment target, timestamp (UTC)
   - expected active channels/subscribers
2. Capture write throughput for 15 minutes
   - record per-minute updates to `flights_current`
   - compute min/avg/p95/max
3. Capture subscriber fanout for 15 minutes
   - sample concurrent subscribers each minute
   - capture peak + average
4. Capture end-to-end realtime lag
   - mark write time from ingestor
   - record client receive time for same update marker
   - compute p50/p95/p99
5. Classify result
   - **PASS:** all metrics under target
   - **WATCH:** target missed but no hard trigger crossed
   - **FAIL:** any hard trigger crossed

## Operating envelope guidance
- Keep default polling at 60s while under target envelope.
- If in WATCH state for 2+ runs, increase observability sampling and prepare scale plan.
- If in FAIL state, initiate immediate scale path per incident runbook (degrade optional features and reduce fanout pressure first).

## Evidence requirements
Store each measurement run at:
- `docs/evidence/realtime/YYYY-MM-DD-realtime-throughput.md`

Use template:
- `docs/evidence/realtime-throughput-template.md`
