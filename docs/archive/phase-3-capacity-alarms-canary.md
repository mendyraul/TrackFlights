# Phase 3 Slice D — Capacity Alarms + Canary Rollout (Issue #4)

This slice turns Phase 3 guardrails into concrete rollout gates and rollback rules so scale changes can be shipped safely.

## 1) Capacity alarm thresholds

### Ingestion lane
- **Queue depth warning:** > 500 jobs for 5 minutes.
- **Queue depth critical:** > 1,500 jobs for 3 minutes.
- **Oldest job age warning:** > 120 seconds for 5 minutes.
- **Oldest job age critical:** > 300 seconds for 3 minutes.
- **Retry ratio warning:** retries > 8% of jobs for 10 minutes.
- **Retry ratio critical:** retries > 15% for 5 minutes.

### Realtime lane
- **Fanout p95 warning:** > 2.0s for 5 minutes.
- **Fanout p95 critical:** > 2.5s for 3 minutes.
- **Subscriber queue saturation warning:** > 60% queue fill on 10%+ subscribers for 5 minutes.
- **Subscriber queue saturation critical:** > 80% queue fill on 15%+ subscribers for 3 minutes.
- **Connection churn warning:** > 12%/min for 10 minutes.
- **Connection churn critical:** > 20%/min for 5 minutes.

### Infra lane
- **Ingestor CPU critical:** > 85% for 10 minutes.
- **Ingestor memory critical:** > 80% for 10 minutes.
- **DB connection saturation warning:** > 70% pool utilization for 10 minutes.
- **DB connection saturation critical:** > 85% for 5 minutes.

## 2) Alert routing
- Warnings route to `#trackflights-ops`.
- Critical alerts page the on-call owner.
- Auto-create incident issue when a critical alert lasts > 10 minutes.

## 3) Canary rollout plan (10% → 50% → 100%)

### Stage 0 — Preflight (required)
- Schema migrations applied and verified.
- Feature flag defaults to OFF.
- Dashboards for queue depth, oldest age, fanout p95, and churn are live.
- Rollback artifact/version is available and tested in staging.

### Stage 1 — 10% canary (30 minutes)
- Enable feature flag for 10% of airports (or hash bucket).
- Success gates:
  - No critical alerts.
  - Fanout p95 < 2.0s.
  - Queue oldest age < 120s.
- If gates pass for full window, proceed to Stage 2.

### Stage 2 — 50% canary (60 minutes)
- Expand to 50% traffic.
- Success gates:
  - Retry ratio < 8%.
  - Subscriber queue saturation below warning threshold.
  - No sustained DB connection warning > 10 minutes.
- If gates pass for full window, proceed to Stage 3.

### Stage 3 — 100% rollout (120 minutes observation)
- Expand to full traffic.
- Maintain elevated alerting for 2 hours.
- Exit criteria:
  - No critical alarms.
  - Warning alarms self-resolve within 10 minutes.

## 4) Hard rollback triggers
Rollback immediately to prior stable version if any are true:
- Critical fanout latency (>2.5s) sustained for 5+ minutes.
- Queue oldest age > 300s sustained for 5+ minutes.
- Error budget burn rate > 2x target for 15+ minutes.
- Crash/restart loop on ingestor (>= 3 restarts in 10 minutes).

## 5) Rollback checklist
1. Disable feature flag globally.
2. Shift traffic to previous stable container revision.
3. Drain/hold non-critical ingestion jobs (alerts/status updates continue).
4. Confirm recovery of fanout latency and queue age to baseline.
5. Publish incident summary + follow-up issue with timeline and metrics.

## 6) 32k-safe implementation slices for local lane
- **D1 Metrics plumbing:** emit queue age/depth, retry ratio, fanout p95, churn.
- **D2 Alert rules:** codify warning/critical thresholds in monitoring config.
- **D3 Canary controls:** flag rollout script + staged gate checks.
- **D4 Rollback automation:** one-command rollback + post-rollback validation script.

## 7) Acceptance criteria
- Thresholds committed and visible in docs/config.
- Canary stages have explicit pass/fail gates.
- Rollback triggers are objective and actionable.
- On-call can execute rollback in < 10 minutes with documented steps.
