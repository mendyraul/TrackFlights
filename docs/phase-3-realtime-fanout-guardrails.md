# Phase 3 Slice C — Realtime Fanout Guardrails (Issue #4)

This slice defines guardrails for websocket/SSE fanout so ingestion spikes do not cascade into client latency, dropped updates, or runaway memory growth.

## 1) Channel/topic partitioning policy
- Primary partition key: `airport_code` (fallback region if airport missing).
- Secondary partition key: `event_type` (`arrival`, `departure`, `status-change`, `alert`).
- Optional tertiary high-load bucket: 15-minute rounded time bucket.
- Producer route: `flights.{airport_code}.{event_type}`.
- Production wildcard subscriptions are disabled.

## 2) Connection + stale subscriber limits
- Max concurrent realtime connections/node: **2,000**.
- Max subscriptions/connection: **25**.
- Max queued messages/subscriber: **200**.
- Heartbeat interval: **30s**; stale mark at **90s**; forced terminate at **120s**.
- Reconnect storm backoff: 1s → 2s → 4s, cap 30s.

## 3) Saturation fallback behavior
When saturation is detected:
1. **Compaction mode**: latest-state only per flight id (3-5s cadence).
2. **Priority mode**: preserve `alert` + `status-change`, defer low-priority telemetry.
3. **Snapshot fallback**: poll snapshot endpoint every 15-30s until recovery.

Recover only after 10 minutes below saturation thresholds.

## 4) Trigger thresholds (feeds Slice D alarms)
- Fanout delivery p95 > **2.5s** for 5 min.
- Subscriber queue saturation (>80%) on >15% active subscribers for 3 min.
- Connection churn > **20%/min** for 5 min.
- Topic skew: top topic >35% fanout CPU for 10 min.

## 5) 32k-safe implementation handoff slices
- **C1 Topic routing contract**: typed topic builder + tests + wildcard guard.
- **C2 Connection quota/cleanup**: per-node caps + heartbeat stale eviction.
- **C3 Backpressure/degraded mode**: queue-depth fallback + priority routing.
- **C4 Metrics/canary guard**: fanout metrics + staged canary (10%→50%→100%).

## 6) Acceptance criteria
- No wildcard realtime subscriptions in production.
- Stale connections evicted within 120s.
- Under synthetic load, p95 fanout latency <2.5s in normal mode.
- Degraded mode preserves critical alert/status delivery under overload.
- Metrics exported for Slice D capacity alarms/canary gates.
