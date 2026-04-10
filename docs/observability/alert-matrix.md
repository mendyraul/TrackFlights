# Alert Matrix (Phase 2 / Slice A / Issue #36)

This matrix defines the minimum production alert set for TrackFlights across web, ingestor, and Supabase.

## Alert Inventory

| ID | Surface | Signal | Trigger | Severity | Owner | Channel | Auto-Action |
|---|---|---|---|---|---|---|---|
| A1 | Web (Vercel) | `/api/health` synthetic check | 3 consecutive failures (1m interval) | P0 | Rico | Telegram urgent + GitHub issue | Mark release as degraded; block deploys |
| A2 | Web (Vercel) | P95 latency | `> 2500ms` for 10 minutes | P1 | Rico | Telegram ops | Open perf follow-up issue if sustained >30m |
| A3 | Web (Vercel) | 5xx rate | `> 2%` over 10 minutes | P1 | Rico | Telegram ops + issue comment on active PR | Roll back latest deploy if tied to release |
| A4 | Ingestor | Poll heartbeat gap | No `Poll cycle complete` for `> 2x poll interval` | P0 | Rico | Telegram urgent + GitHub issue | Restart worker + capture logs |
| A5 | Ingestor | Consecutive pipeline errors | 3 consecutive `Error during poll cycle` events | P1 | Rico | Telegram ops | Reduce optional stages; preserve baseline ingestion |
| A6 | Ingestor | Queue lag | Queue depth above agreed cap for 15 minutes | P1 | Rico | Telegram ops | Pause non-critical enrichment jobs |
| A7 | Supabase | Auth/write failures | 5+ failed writes in 5 minutes or auth errors for 3 cycles | P0 | Rico | Telegram urgent + issue | Rotate/check secrets; failover to safe mode |
| A8 | Supabase realtime | Realtime disconnect/staleness | No realtime updates for 10 minutes while ingestor healthy | P1 | Rico | Telegram ops | Switch UI to polling fallback mode |
| A9 | Data freshness | Flight table freshness SLI | No new flight rows for 2 polling windows | P1 | Rico | Telegram ops | Investigate provider + ingestor sequence |

## Test-Trigger Procedures (Critical Alerts)

### A1 — Web health endpoint failure
1. Temporarily return HTTP 500 from `/api/health` in preview env.
2. Run synthetic probe for 3 intervals.
3. Capture alert event timestamp, channel post, and recovery timestamp.

### A4 — Ingestor heartbeat miss
1. Stop ingestor process for >2 poll intervals.
2. Confirm heartbeat-miss alert appears.
3. Restart process and confirm auto-recovery signal.

### A7 — Supabase auth/write failure
1. Run ingestor with intentionally invalid Supabase service key in non-prod.
2. Observe repeated write/auth failures.
3. Confirm P0 alert and attached failure evidence.

## Evidence Capture Checklist

Store evidence in `docs/evidence/phase2-alert-tests/`.

- [ ] Alert screenshot/log for each critical alert (A1, A4, A7)
- [ ] Trigger command(s) used
- [ ] Detection latency (time-to-alert)
- [ ] Recovery command(s) + time-to-recover
- [ ] Linked follow-up issue (if any)

## Notes

- Thresholds are intentionally conservative for current scale; tune after 2 weeks of telemetry.
- Alert policy should be reviewed after major infra changes (provider, queue model, or Supabase tier changes).
