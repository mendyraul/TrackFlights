# Production Baseline (Issue #1)

This document defines the **minimum production gate** for TrackFlights before feature work continues.

## 1) CI/CD Baseline

Workflow: `.github/workflows/ci.yml`

### Trigger policy
- Run on all pull requests.
- Run on pushes to protected integration branches (`main` now, `dev` when introduced).

### Required jobs
- **Web checks** (Node 20):
  - `npm ci`
  - `npm run lint`
  - `npm run type-check`
  - `npm run build`
- **Ingestor tests** (Python 3.11):
  - install `apps/ingestor/requirements.txt`
  - `pytest -q`

### Gate policy
- CI must be green before merge.
- No direct push to protected branches.

## 2) Branch Protection Strategy

Current repo state has `main` and feature branches only.

### Immediate policy (apply now)
Protect `main` with:
1. Require pull request before merging.
2. Require status checks to pass (`CI / Web lint, type-check, build`, `CI / Ingestor pytest`).
3. Require branch to be up to date before merging.
4. Restrict direct pushes (maintainers merge via PR only).

### Target policy (when `dev` branch is added)
- `feature/*` → PR to `dev`.
- `dev` → PR to `main` for releases only.
- Keep the same required status checks on both `dev` and `main`.

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
