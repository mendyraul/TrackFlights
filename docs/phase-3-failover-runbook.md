# Phase 3 Slice C — Secondary Worker Failover Runbook (Issue #28)

## Scope
Validate one concrete failover path for ingestion worker recovery and document trigger + rollback steps.

## Failover path validated
- **Path:** `systemd` auto-restart of `mia-ingestor.service` after primary process crash.
- **Drill method:** kill current `MainPID` and verify service returns active with a new PID within timeout.
- **Automation command:** `npm run ops:failover-drill`

## Trigger matrix
Promote failover drill/escalation when any of the following happen:

| Signal | Trigger | Severity | Action |
|---|---|---|---|
| Ingestor heartbeat missing | No successful poll > 2 poll intervals | High | Run failover drill + inspect service/journal |
| Consecutive ingestion failures | 3+ cycles with provider/Supabase write errors | High | Restart worker, validate config/secrets, monitor recovery |
| Service crash-loop | `systemctl` restart counter increments with no stable cycle | Critical | Pause deploy changes, switch to known-good config, validate key/env |

## Switchover procedure
1. Verify current status:
   - `systemctl status mia-ingestor.service --no-pager`
2. Run controlled failover drill:
   - `npm run ops:failover-drill`
3. Confirm recovered service PID differs from the killed PID.
4. Validate post-recovery health:
   - `journalctl -u mia-ingestor.service -n 50 --no-pager`
   - Confirm new startup logs and no immediate fatal configuration errors.

## Rollback / stabilization
If service restarts but remains unhealthy:
1. Restore previous known-good env/config for ingestor service.
2. Restart service:
   - `sudo systemctl restart mia-ingestor.service`
3. Verify stable runtime for at least 2 poll cycles.
4. If still failing, mark as operational incident and keep worker in safe paused mode until secrets/config are corrected.

## Drill evidence (2026-04-11)
Evidence files:
- `docs/evidence/phase3-failover/failover-drill-2026-04-11T13-23-13Z.log` ✅ PASS (new PID observed)
- `docs/evidence/phase3-failover/failover-drill-2026-04-11T13-23-07Z.log` initial failed precheck before restart

Key observation:
- Failover mechanics (process crash -> service restart) worked.
- Runtime config is currently incomplete (`flight_api_key` missing), so service health is not production-ready even though restart behavior is validated.

## Follow-up gap
- Configure/verify `flight_api_key` (or provider fallback config) in service environment so post-failover recovery is both **alive** and **operational**.
