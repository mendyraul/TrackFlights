# Alert Matrix — Web, Ingestor, Supabase

Parent issue: #3  
Slice: #36 (Phase 2 / Slice A)

This matrix defines critical and warning alerts, owners, channels, and test-trigger procedures.

## Alert Matrix

| Area | Signal | Threshold / Rule | Severity | Owner | Channel | Test Trigger Procedure | Evidence Capture |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Web API | Uptime (`/api/healthz`) | 2 consecutive failures from 2 probes over 5 min | Critical | Backend on-call | Slack `#ops-alerts`, PagerDuty | Point probe URL to known invalid route for one cycle, then restore | Screenshot/JSON probe failures + recovery timestamp |
| Web API | P95 latency | `p95 > 1200ms` for 10 min | High | Backend on-call | Slack `#ops-alerts` | Run controlled load against search endpoint with debug delay flag in staging | Metrics panel screenshot + request count |
| Web API | 5xx error rate | `5xx_rate > 2%` for 5 min | Critical | Backend on-call | Slack `#ops-alerts`, PagerDuty | Deploy temporary fault injection to throw on 10% of requests in staging | Error chart screenshot + rollback commit |
| Ingestor | Job run failure rate | `>= 2 failed runs` in 30 min | High | Data pipeline owner | Slack `#ops-alerts` | Run ingestor with intentionally bad API key in staging secret scope | Job logs + alert notification screenshot |
| Ingestor | Queue lag / backlog age | `oldest_job_age > 10 min` or backlog > 500 jobs for 15 min | Critical | Data pipeline owner | Slack `#ops-alerts`, PagerDuty | Pause consumer process for 15 min in staging, then resume | Backlog chart before/after + resume timestamp |
| Supabase | DB error rate | `db_error_rate > 1%` for 10 min | High | Backend on-call | Slack `#ops-alerts` | Run migration smoke test with known failing query in staging | Supabase logs export + query id |
| Supabase | Auth failures | auth failures spike `> 3x` baseline for 10 min | Warning | Backend on-call | Slack `#ops-alerts` | Replay invalid JWT batch against staging endpoint | Auth dashboard screenshot + sample request IDs |
| Supabase Realtime | Realtime disconnect rate | disconnect/reconnect churn `> 15%` for 10 min | High | Backend + frontend on-call | Slack `#ops-alerts` | Restart realtime client pods in staging during synthetic listener test | Client error logs + reconnect metrics |

## Critical Alert Test-Trigger Checklist

Use this checklist for each **Critical** alert before marking Phase 2 Slice A complete.

- [ ] Test executed in non-production environment (staging/dev only)
- [ ] Trigger procedure followed exactly as documented in matrix
- [ ] Alert fired in expected channel(s)
- [ ] Timestamp of trigger and timestamp of alert captured
- [ ] Evidence artifacts stored (logs/screenshots/links)
- [ ] Recovery performed and validated
- [ ] Post-test note added to issue with evidence links

## Evidence Capture Template

Copy/paste into issue comments:

```md
### Alert Trigger Evidence
- Alert: <name>
- Environment: <staging/dev>
- Trigger start (UTC): <time>
- Alert received (UTC): <time>
- Channel(s): <#ops-alerts / PagerDuty>
- Evidence:
  - Dashboard screenshot: <link>
  - Logs/query ids: <link or snippet>
- Recovery action: <what was restored>
- Recovery complete (UTC): <time>
```
