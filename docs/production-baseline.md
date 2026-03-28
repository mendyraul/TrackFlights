# Production Baseline (Issue #1)

This document defines the **minimum production gate** for TrackFlights before feature work continues.

## 1) CI/CD Baseline

Workflow: `.github/workflows/ci.yml`

### Trigger policy
- Run on all pull requests.
- Run on pushes to protected integration branches (`main` now, `dev` when introduced).

### Required jobs
- **Phase 1 Baseline Check** (Node 20 + Python 3.11 via `npm run ci:baseline`):
  - `npm ci`
  - `npm run lint`
  - `npm run type-check`
  - `npm run build`
  - ingestor dependency install from `apps/ingestor/requirements.txt`
  - ingestor `pytest -q`

### Gate policy
- CI must be green before merge.
- No direct push to protected branches.

### Fail + rerun policy
- If CI fails, push a fix commit to the same PR branch (do not bypass checks).
- After flaky/network failures, rerun failed jobs once; if the second run fails, treat as a real failure and fix root cause.
- Do not merge with skipped or neutral required checks.

## 2) Branch Protection Strategy

Detailed policy is maintained in `docs/branch-protection.md` (Issue #9 / Slice B), including:
- exact required check name (`Phase 1 Baseline / Phase 1 Baseline Check`)
- PR-only merge + approval policy for `main` and `dev`
- 5-minute GitHub UI handoff checklist

Baseline requirement remains: no direct pushes to protected branches and no merges without required checks passing.

## 3) Environment Variable Strategy

### Frontend (`apps/web`)
Public-only variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Notes:
- Build must not crash in CI when these are unset; local fallback values are acceptable for compile-time checks only.
- Real deployments must set real values in Vercel project settings.

### Ingestor (`apps/ingestor`)
Server-side secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLIGHT_API_KEY` (if provider requires)

Notes:
- Never expose ingestor secrets to client/runtime bundles.
- Use `.env.example` for key names only (no real secrets).

## 4) Definition of Done for Baseline

- [x] CI workflow committed and running in GitHub Actions.
- [x] Deterministic installs (`npm ci`) and lockfile committed.
- [x] Lint/type-check/build + ingestor pytest in CI.
- [x] Baseline branch protection and env strategy documented.
- [ ] Branch protection rules applied in GitHub settings.

Owner action remaining: enable the branch protection settings in repository configuration.
