# Runtime Hardening Checklist (Issue #2 Slice 2)

This checklist defines the minimum recurring hardening tasks for TrackFlights production runtime.

## A) Web security headers + CSP ownership

Owner: Web maintainer (default: Rico)

- [ ] Keep baseline headers enabled in deployment config (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- [ ] Review CSP allowlist monthly and remove stale domains.
- [ ] For each new third-party script or API domain, record rationale in PR description.
- [ ] Verify `/api/health` endpoint still responds under header policy after each Next.js upgrade.

Verification command:

```bash
curl -sI https://<production-host>/api/health
```

Expected: non-5xx response and security headers present.

## B) Secrets rotation cadence

Owner: Repo admin + deploy owner

- [ ] Rotate `SUPABASE_SERVICE_ROLE_KEY` every 90 days or immediately after suspected exposure.
- [ ] Rotate `AVIATIONSTACK_API_KEY` every 90 days (or provider policy minimum).
- [ ] Rotate GitHub Actions secrets after maintainer offboarding.
- [ ] Confirm old keys are revoked after rotation.

Rotation evidence path:

- `docs/evidence/security/rotations/YYYY-MM-DD.md`

## C) Dependency update cadence

Owner: Runtime hardening rotation

- [ ] Run `npm audit --omit=dev --audit-level=high` weekly.
- [ ] Run `npm outdated` weekly and patch high-risk packages first.
- [ ] Run `pip list --outdated` in `apps/ingestor/.venv` weekly.
- [ ] Track accepted risk with expiry date for any deferred high/critical advisory.

Minimum policy:

- Critical vulnerabilities: patch/redeploy within 24h.
- High vulnerabilities: patch/redeploy within 7 days.
- Medium and below: batch in next routine dependency window.

## D) Backup + restore verification cadence

Owner: Data/on-call owner

- [ ] Confirm Supabase PITR/backups are enabled monthly.
- [ ] Run restore drill quarterly in a non-production project.
- [ ] Verify ingestor restart after restore using `python -m src.utils.health_snapshot`.
- [ ] Save drill output and timestamped evidence.

Evidence path:

- `docs/evidence/recovery/YYYY-QN-restore-drill.md`

## E) Review rhythm

- Weekly: dependency + secrets sanity review (15 minutes).
- Monthly: CSP/header + backup configuration audit.
- Quarterly: restore drill and incident-playbook update.

Completion criteria for Slice 2:

- Checklist committed.
- Linked from production baseline and Phase 4 plan.
- Owners and cadence explicitly documented.
