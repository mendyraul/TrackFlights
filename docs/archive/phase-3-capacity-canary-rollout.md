# Phase 3 Slice D — Capacity Alarms + Canary Rollout (Issue #4)

This slice defines concrete alert thresholds and a low-risk rollout/rollback process for ingestion + realtime changes.

## 1) Alert thresholds (initial)

Use a 3-level model:
- **Info**: early signal, no paging.
- **Warn**: action required in business hours.
- **Critical**: page + automated mitigation.

### Ingestion queue health

- **Queue depth (`ingest_queue_depth`)**
  - Info: > 500 for 5m
  - Warn: > 2,000 for 10m
  - Critical: > 5,000 for 10m

- **Oldest job age (`ingest_oldest_job_age_sec`)**
  - Info: > 60s for 5m
  - Warn: > 180s for 10m
  - Critical: > 300s for 10m

- **Retry rate (`ingest_retry_rate`)**
  - Warn: > 5% for 15m
  - Critical: > 10% for 10m

### Pipeline cycle lag

- **Scheduler/cycle lag (`pipeline_cycle_lag_sec`)**
  - Info: > 30s for 5m
  - Warn: > 90s for 10m
  - Critical: > 180s for 10m

### Realtime fanout health

- **Fanout p95 delay (`realtime_fanout_delay_p95_ms`)**
  - Info: > 800ms for 5m
  - Warn: > 1,500ms for 10m
  - Critical: > 3,000ms for 10m

- **Dropped/bounced realtime messages (`realtime_drop_rate`)**
  - Warn: > 1% for 10m
  - Critical: > 3% for 10m

- **Active subscribers per topic (`realtime_topic_subscribers`)**
  - Warn: > 80% of cap for 10m
  - Critical: > 95% of cap for 5m

## 2) Alert actions and ownership

- **Warn**
  - Open incident note in ops channel.
  - Check queue/fanout dashboard for hotspot topic or route.
  - Apply scale-up runbook if sustained >15m.

- **Critical**
  - Page on-call.
  - Trigger degrade mode (from Slice C):
    - reduce low-priority fanout frequency
    - enforce stricter stale-subscriber eviction
    - temporarily cap new subscriber joins on saturated topics
  - If no recovery in 15m, rollback canary.

## 3) Canary rollout checklist

### Pre-rollout gate (must pass)

- [ ] CI green on feature branch
- [ ] Required env vars confirmed for target environment
- [ ] Dashboard panels visible for all metrics above
- [ ] Alert rules loaded but critical auto-page muted for first 15m warm-up
- [ ] Rollback command/script pre-validated

### Rollout plan

1. **Canary 10% traffic / 1 shard / 1 region** for 30 minutes.
2. If no critical alerts and warn alerts stable/decreasing, move to **25% for 60 minutes**.
3. Then **50% for 60 minutes**.
4. Full rollout only if:
   - no critical events
   - warn alerts are acknowledged with known cause and no upward trend
   - p95 fanout and queue age are below warn thresholds for 45 continuous minutes

### Rollback triggers (immediate)

Rollback immediately if any occur during canary:
- Critical queue depth or oldest-job-age alert fires for >10m
- Critical fanout delay alert fires for >10m
- Drop rate critical threshold breached for >5m
- User-visible stale-data incidents confirmed in production

### Post-rollout validation (24h)

- [ ] No repeating warn/critical alerts tied to rollout changes
- [ ] Retry rate stayed below 5%
- [ ] Fanout p95 trend within expected variance
- [ ] Incident log updated with rollout result and next tuning actions

## 4) Handoff items for implementation slice

- Add metric emitters for missing queue-age/fanout-delay counters.
- Add alert rule manifests for warn/critical thresholds.
- Add rollout runbook script for canary percentage progression.
- Add automated rollback shortcut in ops docs.
