# Incident Runbook (Baseline)

## Flow
1. Detect
2. Triage
3. Contain
4. Recover
5. Postmortem

## Severity Levels
- **SEV-1/P1:** Full outage, ingestion stop, or data-corruption risk (immediate page).
- **SEV-2/P2:** Significant degradation/user impact (ack <= 15m).
- **SEV-3/P3:** Moderate degradation with workaround (ack <= 1h).
- **SEV-4/P4:** Low-risk warning (next business day).

## Triage Checklist
- Confirm alert source and timestamp.
  - Dashboards: Vercel project overview, Supabase project health, ingestion logs.
  - Quick checks:
    - `curl -sS https://<prod-domain>/api/health | jq`
    - `curl -sS https://<prod-domain>/api/healthz/web | jq`
    - `curl -sS https://<prod-domain>/api/healthz/supabase | jq`
- Identify impacted component(s): web / ingestor / Supabase.
- Estimate blast radius and data risk.
- Assign owner and severity.
- Start incident timeline in UTC.

## Containment Checklist
- Pause risky rollouts/jobs.
  - Vercel: stop/promote rollback candidate as needed.
  - Ingestor: pause scheduler/worker trigger path.
- Enable safe-mode throttling/backoff.
- Roll back latest deploy when regression is likely.
  - `vercel rollback <deployment-url-or-id>` (or dashboard rollback action)
- Isolate affected integration paths.
  - Disable non-essential API calls / writes if they amplify impact.

## Recovery Checklist
- Return all required health checks to green.
- Verify ingestion lag and queue depth normalize.
- Confirm end-to-end user path recovery.
- Monitor 30 minutes after mitigation.
- Publish recovery summary + residual risk.

## Escalation Path
1. Primary on-call takes ownership.
2. If unresolved after 20m (SEV-1/2), page secondary owner.
3. If infra/vendor fault suspected, escalate platform + vendor support.
4. If data integrity risk exists, freeze non-essential writes.

Communication channels (set per environment):
- Primary incident room/channel (chat + call bridge)
- Paging rotation (primary/secondary)
- Vendor escalation ticket links (Vercel/Supabase)

## Tooling & Commands Appendix
- Health endpoints:
  - `curl -sS https://<prod-domain>/api/health | jq`
  - `curl -sS https://<prod-domain>/api/healthz/web | jq`
  - `curl -sS https://<prod-domain>/api/healthz/supabase | jq`
- Ingestor snapshot (when available in repo automation):
  - `npm run ops:health-snapshot` *(if script exists in current branch)*
- GitHub + deployment context:
  - `gh pr checks <pr-number> --repo mendyraul/TrackFlights`
  - `gh run list --repo mendyraul/TrackFlights --limit 10`
- Rollback:
  - `vercel rollback <deployment-url-or-id>`

## On-Call Handoff Notes
Include current severity, impact, timeline, hypotheses tested, links to logs/dashboards/PRs, and explicit next owner/action.

## Postmortem Minimum
- Summary (impact + duration)
- Root cause(s) + contributors
- Detection/response gaps
- What worked / what failed
- Action items with owners and due dates

## Logging Hygiene
Capture trace IDs and evidence links; never include secrets or PII.
