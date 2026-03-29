# Phase 3 Slice C — Realtime Fanout Guardrails

Issue: `mendyraul/TrackFlights#4`

## Why this slice exists
As ingest volume grows, unmanaged realtime fanout can overload websocket channels, create reconnect storms, and cause stale subscribers to consume throughput. This slice defines explicit guardrails before broader rollout.

## SLO targets
- p95 realtime fanout delay: **< 2s** from DB write to client event
- websocket disconnect rate: **< 2%** per 15-minute window
- stale subscriber ratio: **< 10%** of active channel members

## Channel partitioning policy
Use bounded partitioned channels instead of one unbounded global channel.

### Channel naming
- `flights:airport:{iata}:p{partition}`
- Partition count default: `4` per airport
- Partition key: `flight_id % partition_count`

### Rules
1. Clients subscribe only to channels needed for current view scope.
2. Server broadcast path computes partition once per event and emits only to that partition.
3. Do not broadcast wildcard events to every partition.

## Subscriber limits and cleanup
### Hard caps
- Soft warning: **150 subscribers/channel**
- Hard cap: **200 subscribers/channel**

### Cleanup cadence
- Sweep interval: every **60s**
- Disconnect subscribers idle for **> 120s** without heartbeat/ack
- Track `last_seen_at` and `heartbeat_miss_count`

### Degrade behavior at cap
1. New subscriber receives `channel_saturated` status payload.
2. Client falls back to polling (`30s` cadence) until channel pressure drops.
3. UI shows degraded realtime badge (yellow).

## Saturation fallback modes
### Mode 0 — Normal
- Full `INSERT/UPDATE/DELETE` fanout

### Mode 1 — Elevated pressure (warning)
Trigger: subscribers > 150 OR p95 fanout delay > 2s for 5m
- Drop low-value transient fields from payload (`heading`, `vertical_speed_fpm`)
- Keep status/position/time-critical fields

### Mode 2 — Saturated (critical)
Trigger: subscribers > 200 OR p95 fanout delay > 5s for 2m
- Broadcast only status changes and major position deltas
- Force noncritical clients to polling fallback
- Emit operator alert and open incident checklist

## Metrics + thresholds
| Metric | Warning | Critical | Action |
|---|---:|---:|---|
| `realtime_channel_subscribers` | >150 | >200 | enter mode 1/2 |
| `realtime_fanout_delay_p95_ms` | >2000 | >5000 | degrade payload and fallback |
| `realtime_disconnect_rate` | >2% | >5% | trigger reconnect-throttle controls |
| `realtime_stale_subscriber_ratio` | >10% | >20% | force cleanup sweep |

## Rollout checklist (pre-D slice)
- [ ] Add partition constants to config and environment matrix
- [ ] Implement heartbeat tracking for subscriber lifecycle
- [ ] Add dashboards for fanout delay and subscriber saturation
- [ ] Add alert routes (warning -> Slack/Telegram, critical -> incident)
- [ ] Run 30-minute canary at 10% traffic before global enablement

## Ownership and runbook
- Primary owner: Rico (orchestration)
- Local implementation lane: Junior/Fix
- Escalation to Codex: only after 2 failed local attempts on same implementation slice

Incident first response:
1. Confirm active mode (0/1/2)
2. Validate cleanup worker is running
3. Force mode 2 if delays exceed critical threshold
4. Announce degrade state in ops channel
5. Create follow-up issue with snapshots and timelines
