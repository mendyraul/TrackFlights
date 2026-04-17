# Phase 3 Failover Drill Evidence

Issue: #28
Date: 2026-04-11
Service: `mia-ingestor.service`

## Evidence files
- `failover-drill-2026-04-11T13-23-07Z.log` — precheck attempt failed because service was inactive.
- `failover-drill-2026-04-11T13-23-13Z.log` — successful crash/restart drill (`PASS`) with new PID.

## Validation summary
- Secondary recovery path validated: systemd restarted service after primary process kill.
- Residual gap: ingestor runtime configuration currently errors on missing `flight_api_key`; this is separate from failover mechanics and must be addressed for full operational readiness.
