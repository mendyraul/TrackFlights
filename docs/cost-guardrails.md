# Cost Guardrails & Alerts (Phase 4)

Goal: prevent surprise spend while preserving reliability as traffic grows.

## Guardrail Targets

### Vercel

- **Spend cap**: set monthly project budget in Vercel billing settings.
- **Alerts**:
  - 50% budget consumed (warning)
  - 80% budget consumed (high)
  - 95% budget consumed (critical, freeze non-essential deploys)
- **Runtime controls**:
  - Keep edge/function timeout limits explicit per route.
  - Disable unnecessary preview deployments for bulk doc-only branches when possible.

### Supabase

- **Usage monitors**:
  - Database egress
  - Realtime connections/messages
  - Storage egress
  - Compute/add-on usage
- **Alerts**:
  - 60% plan quota (warning)
  - 85% plan quota (high)
  - 95% plan quota (critical, activate traffic-reduction playbook)

### Raspberry Pi ingestor host

- **Capacity constraints**:
  - CPU sustained > 80% for 15m
  - Memory > 85% for 15m
  - Disk usage > 80%
- **Action**: on trigger, reduce polling fanout and defer non-critical processing until stable.

## Weekly Cost Review Checklist

- [ ] Export Vercel spend + usage snapshot
- [ ] Export Supabase usage dashboard snapshot
- [ ] Compare week-over-week change by component (web, realtime, db, ingestor)
- [ ] Record top growth driver and mitigation action
- [ ] Create follow-up issue if any component grows >25% WoW without product justification

## Release Gate (Cost)

Before promoting a release to production:

- [ ] Vercel budget alerts verified (50/80/95)
- [ ] Supabase quota alerts verified (60/85/95)
- [ ] Ingestor host capacity alerts active
- [ ] Cost escalation contact/channel confirmed
- [ ] Rollback trigger includes cost spike condition (see `rollback-runbook.md`)

## Evidence Path

Store evidence under `docs/evidence/cost/`:

- `YYYY-MM-DD-vercel-usage.md`
- `YYYY-MM-DD-supabase-usage.md`
- `YYYY-MM-DD-weekly-cost-review.md`

Owner: Rico  
Status: Baseline guardrails defined; dashboard alert wiring pending operator setup
