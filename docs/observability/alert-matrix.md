# Alert Matrix — Phase 2 / Slice A (Issue #36)

## Purpose
Define deterministic alerting coverage for TrackFlights web uptime, ingestion pipeline health, and Supabase dependency failures.

## Severity Model
- **SEV-1**: User-visible outage or data pipeline stop. Immediate action.
- **SEV-2**: Partial degradation with material user risk. Action in same hour.
- **SEV-3**: Early warning / drift. Action within business day.

## Owner + Channel Defaults
- **Primary owner:** Raul (`@mendyraul`)
- **Secondary owner:** Rico (automation)
- **Primary channel:** Telegram alerting channel — this is the immediate paging mechanism for **SEV-1** alerts.
- **Secondary channel:** GitHub issue in `mendyraul/TrackFlights` labeled `priority:high` for timeline tracking and follow-up actions.

## Alert Matrix

| Domain | Signal | Threshold | Severity | Owner | Channel | Synthetic Trigger Test |
|---|---|---:|---|---|---|---|
| Web availability | Health endpoint failure (`/api/healthz/live`) | 3 consecutive failures (1m cadence) | SEV-1 | Raul | Telegram + GitHub issue | Temporarily force health route to return 503 in preview; verify alert + recovery clear event |
| Web latency | p95 request latency | > 2500ms for 10 minutes | SEV-2 | Raul | Telegram | Deploy controlled slow-path in preview for one endpoint; confirm threshold breach then rollback |
| Web errors | 5xx rate | > 3% over 10 minutes | SEV-2 | Raul | Telegram + GitHub issue | Inject a guarded failing route in preview; send burst traffic and confirm error-rate alert |
| Ingestor freshness | Time since last successful poll | > 15 minutes | SEV-1 | Raul | Telegram + GitHub issue | Stop ingestor process for >15m in non-prod and confirm stale-poll alarm |
| Ingestor throughput | Rows upserted per poll | 0 rows for 3 consecutive polls during expected traffic window | SEV-2 | Raul | Telegram | Configure provider mock to return empty payload; confirm no-upsert alert |
| Ingestor failures | Consecutive ingestion errors | >= 3 consecutive failures | SEV-1 | Raul | Telegram + GitHub issue | Inject invalid API key in preview env; confirm failure streak alert |
| Queue lag / backlog | Pending jobs older than threshold | > 5 min lag for 10 min | SEV-2 | Raul | Telegram | Pause worker, keep producer active, verify lag threshold breach |
| Supabase REST health | REST API error rate | > 2% 5xx/429 over 10 min | SEV-2 | Raul | Telegram | Run controlled rate-limit stress in staging; verify alert + cooldown behavior |
| Supabase DB health | Connection / query error spike | > 5 query failures in 5 min | SEV-2 | Raul | Telegram + GitHub issue | Apply temporary wrong DB URL in staging worker; verify error spike alert |
| Supabase Realtime | Realtime disconnect/reconnect churn | > 5 disconnects in 10 min | SEV-3 | Raul | Telegram | Force websocket disconnect loop in preview client; verify churn alert |
| Data integrity | `flights_current` stale snapshot | No row updates for > 20 min | SEV-1 | Raul | Telegram + GitHub issue | Pause ingest writes while app running; confirm stale-data alert |

## Escalation Policy
1. SEV-1: page immediately, open high-priority issue with timeline stub.
2. SEV-2: notify immediately, owner acknowledges within 60 minutes.
3. SEV-3: daily triage bucket unless repeated 3x/day, then upgrade to SEV-2.

## Evidence Requirement
Every alert test must generate an evidence record under `docs/evidence/phase2-alert-tests/` using the checklist in `docs/observability/alert-test-checklist.md`.
