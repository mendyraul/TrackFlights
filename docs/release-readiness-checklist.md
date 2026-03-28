# Release Readiness Checklist (Phase 4 Slice B)

This checklist is the merge gate for production-bound changes.

## 1) CI and test health
- [ ] `CI / Web lint, type-check, build` is green
- [ ] `CI / Ingestor pytest` is green
- [ ] Security Gates workflow is green (`Node production dependency audit`, `Ingestor Python dependency audit`)

## 2) Deploy preview health
- [ ] Vercel preview deployment succeeded
- [ ] Smoke test completed for key pages and map load
- [ ] `/api/health` endpoint returns healthy status

## 3) Security gate
- [ ] `docs/security-hardening-checklist.md` items reviewed
- [ ] No high/critical findings from `npm audit --omit=dev --audit-level=high`
- [ ] No pip-audit findings requiring patch before release
- [ ] Secret scan / env review completed

## 4) Data and infra gate
- [ ] Supabase migrations reviewed and applied in target environment
- [ ] RLS/policy review complete for any changed tables
- [ ] Ingestor service restart + health snapshot validated

## 5) Change control
- [ ] PR contains rollback notes (if risky)
- [ ] STATUS.md updated with outcome
- [ ] Release note summary posted on the linked issue/PR

Owner: Rico
Status: Active baseline (Phase 4 Slice B)
