# Release Candidate Evidence — <rc-id>

Use `npm run ops:release-evidence -- <rc-id>` to generate a per-candidate copy from this structure.

- Generated (UTC):
- Operator:
- Environment: (staging/prod)
- Related PR(s):
- Related issue(s):

## 1) Baseline + Security Gates
- [ ] 'npm run release:preflight' passed
- [ ] 'npm run security:baseline' passed
- Command output/log links:

## 2) Performance SLO Spot Check
- [ ] Web '/api/health' p95 under baseline target (<=250ms)
- [ ] Ingestor cycle + queue lag within targets
- Evidence links:

## 3) Alerting + Observability
- [ ] Latest alert-test evidence linked ('docs/evidence/phase2-alert-tests/')
- [ ] No unresolved critical alerts at signoff time
- Evidence links:

## 4) Last Known Good Snapshot (required)
- Snapshot timestamp (UTC):
- Commit SHA:
- Web health sample output:
- Ingestor heartbeat sample output:
- Rollback target commit/tag:

## Signoff
- [ ] Engineering signoff
- [ ] Product/owner signoff
- Notes:
