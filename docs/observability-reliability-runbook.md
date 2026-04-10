# Observability + Reliability Runbook (Issue #3 Phase 2 Slice 3)

This runbook defines the minimum operations baseline for TrackFlights reliability.

## 1) Monitoring + Alerting Plan

### Web (Vercel)
- Health endpoint: `GET /api/health` (returns `status=ok`)
- Monitor interval: every 1 minute
- Alert triggers:
  - Endpoint failure for 3 consecutive checks
  - P95 latency > 2.5s for 10 minutes

### Ingestor (Raspberry Pi worker)
Signals to monitor from logs:
- `Poll cycle complete` (must appear every configured poll interval)
- `Ingestor runtime heartbeat` (every 10 cycles)
- `Error during poll cycle` / `Weather ingestion failed` / `Prediction generation failed` / `Anomaly detection failed`

Alert triggers:
- No successful `Poll cycle complete` in > 2 poll intervals
- Error logs in 3 consecutive cycles

### Supabase
- Alert on sustained auth errors / 5xx responses from ingestor writes
- Alert on ingestion write failures > 5 minutes
- Alert if stale flight cleanup stops for > 60 minutes

## 2) Structured Logging Standard

Required fields for operational logs:
- `event` (message)
- `cycle` (where applicable)
- `provider`
- `cycle_duration_ms`
- `service` (`web` or `ingestor`)
- `severity`

Current baseline:
- Ingestor emits structured runtime logs via `structlog` with cycle metrics.
- Web now exposes machine-readable health status at `/api/health`.

## 3) Incident Response (P0/P1)

### P0 — Full outage (web unavailable or ingestion halted)
1. Check Vercel deployment health + latest build logs.
2. Check ingestor process status/logs on Pi.
3. Validate Supabase connectivity and credentials.
4. Roll back to last known-good deployment if needed.
5. Post incident note with start time, impact, and ETA.

### P1 — Partial degradation (slow UI, delayed updates)
1. Check `/api/health` latency trend.
2. Inspect ingestor cycle duration and error counts.
3. Verify provider API quotas and response quality.
4. Mitigate by reducing poll pressure and disabling optional ML stages temporarily.

## 4) Backup / Restore (Supabase)

### Target objectives
- **RPO:** 60 minutes
- **RTO:** 120 minutes

### Backup procedure
- Daily logical backup of flight-related tables and schema metadata.
- Keep 7 daily snapshots + 4 weekly snapshots.
- Store backup checksum and restore timestamp in operations notes.

### Restore drill (monthly)
1. Restore latest backup into a non-production project.
2. Validate core tables + row counts + latest timestamps.
3. Run ingestor against restored environment in dry-run/read mode.
4. Record restore duration and data gap.

## 5) Final Verification Checklist (Issue #3 close-out)

Run this before closing Issue #3:
- [ ] Simulate web health endpoint failure and confirm alert dispatch.
- [ ] Stop ingestor for > 2 intervals and confirm heartbeat-miss alert.
- [ ] Trigger a controlled Supabase auth failure and confirm alert.
- [ ] Capture acknowledgment path for each alert trigger.
- [ ] Execute one non-prod restore drill and record measured RPO/RTO.

Evidence locations:
- Alert trigger proof: `docs/evidence/phase2-alerts/`
- Backup/restore drill proof: `docs/evidence/phase2-backup-restore/`

Latest validated run:
- Alert scenarios: `docs/evidence/phase2-alerts/2026-04-10.md`
- Backup/restore drill: `docs/evidence/phase2-backup-restore/2026-04-10.md`
