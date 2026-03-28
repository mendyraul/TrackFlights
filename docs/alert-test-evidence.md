# Alert-Test Evidence Capture (Issue #3 Phase 2 Slice 4)

Use this checklist during reliability drills and paste outputs into an issue comment.

## Evidence destination
- Create one evidence file per drill at: `docs/evidence/phase2-alert-tests/YYYY-MM-DD.md`
- Include command output snippets + timestamps (UTC).

## Baseline self-check commands

```bash
# 1) Web health endpoint baseline
curl -sS "$TRACKFLIGHTS_WEB_URL/api/health"

# 2) Ingestor runtime config + heartbeat threshold snapshot
cd apps/ingestor
python -m src.utils.health_snapshot
```

## Alert test matrix

### A. Web health alert
1. Temporarily break `/api/health` response or route.
2. Confirm monitor fires after 3 failed checks.
3. Capture:
   - monitor event id
   - first failure timestamp
   - recovery timestamp

### B. Ingestor heartbeat-miss alert
1. Stop ingestor for > 2 poll intervals.
2. Confirm heartbeat-miss alert fires.
3. Capture:
   - service stop/start timestamps
   - alert trigger timestamp
   - recovery timestamp after restart

### C. Supabase auth failure alert
1. Set invalid service role key in non-prod test env.
2. Trigger one poll cycle.
3. Confirm write/auth error alert.
4. Capture:
   - log line showing auth failure
   - alert trigger timestamp
   - clear/recovery confirmation

## Acceptance gate
Issue #3 is not done until all three alert tests have evidence links.
