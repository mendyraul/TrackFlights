# Phase 3 Slice C — Realtime Fanout Guardrails

Issue: `mendyraul/TrackFlights#4`

This slice defines guardrails for websocket/SSE fanout so ingestion spikes do not cascade into client latency, dropped updates, or runaway memory growth.

## SLO targets
- p95 realtime fanout delay: **< 2s** from DB write to client event
- websocket disconnect rate: **< 2%** per 15-minute window
- stale subscriber ratio: **< 10%** of active channel members

## Channel/topic partitioning policy
- Primary partition key: `airport_code`
- Secondary partition key: `event_type` (`arrival`, `departure`, `status-change`, `alert`)
- Channel naming: `flights:airport:{iata}:p{partition}`
- Partition count default: `4` per airport
- Production wildcard subscriptions are disabled

## Connection + stale subscriber limits
- Soft warning: **150 subscribers/channel**
- Hard cap: **200 subscribers/channel**
- Max queued messages/subscriber: **200**
- Heartbeat interval: **30s**
- Stale mark at **90s**, forced terminate at **120s**
- Cleanup sweep interval: **60s**

## Saturation fallback behavior
1. **Mode 0 (normal)**: full event fanout.
2. **Mode 1 (warning)**: compact payloads and preserve critical fields.
3. **Mode 2 (critical)**: status-change + major position deltas only; force noncritical clients to polling fallback.

## Trigger thresholds
- Fanout delivery p95 > **2.5s** for 5 min
- Queue saturation (>80%) on >15% active subscribers for 3 min
- Connection churn > **20%/min** for 5 min
- Topic skew: top topic >35% fanout CPU for 10 min

## Acceptance criteria
- No wildcard realtime subscriptions in production.
- Stale connections evicted within 120s.
- Under synthetic load, p95 fanout latency <2.5s in normal mode.
- Degraded mode preserves critical alert/status delivery under overload.
- Metrics exported for Slice D capacity alarms/canary gates.
