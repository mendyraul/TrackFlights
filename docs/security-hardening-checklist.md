# Security Hardening Checklist (Phase 4 / Slice A)

Parent issue: #2  
Slice issue: #19

This baseline audit checks current security posture across web app, ingestor, and infra.  
Legend: ✅ Pass | ⚠️ Gap

## 1) Web/API surface

| Check | Status | Evidence | Follow-up |
|---|---|---|---|
| Security headers configured (CSP, HSTS, X-Frame-Options, etc.) | ⚠️ Gap | `apps/web/next.config.js` only sets `reactStrictMode` + `output`; no `headers()` policy configured. | Add explicit security headers in Next config and validate in production response headers. |
| Sensitive server secrets exposed to browser | ✅ Pass | Browser code uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`apps/web/src/lib/supabase.ts`). | Keep service-role keys server/worker-only. |
| API route hardening required (auth/rate-limit/input validation) | ⚠️ Gap | No app-level API routes currently present under `apps/web/src/app/api`; future routes have no baseline policy yet. | Add API hardening template (auth, schema validation, rate limits) before introducing public API routes. |

## 2) Rate limiting / abuse controls

| Check | Status | Evidence | Follow-up |
|---|---|---|---|
| Application-level rate limiting for public endpoints | ⚠️ Gap | No rate-limit middleware/library configured in current web app or ingestor. | Define default limit policy (read/write classes) for future API endpoints and ingestion webhooks. |
| Upstream retry behavior bounded | ✅ Pass | Ingestor API provider retries are bounded to 3 attempts with exponential wait (`apps/ingestor/src/providers/aviationstack_provider.py`). | Add circuit-breaker/backoff metrics if external API instability increases. |

## 3) Dependency and supply-chain hygiene

| Check | Status | Evidence | Follow-up |
|---|---|---|---|
| Lockfiles committed for reproducible installs | ⚠️ Gap | No root `package-lock.json` present; reproducibility is weaker without lockfiles. | Commit npm lockfile(s) and enforce deterministic CI install (`npm ci`). |
| Dependency vulnerability scanning in CI | ⚠️ Gap | No security scan workflow documented in repo docs/files checked. | Add automated `npm audit` + Python `pip-audit`/`safety` in CI. |
| Runtime dependency pinning for Python | ⚠️ Gap | Python requirements/pyproject exist, but no documented vulnerability gate in CI. | Add periodic pip audit job and policy for upgrades/patches. |

## 4) Secrets hygiene

| Check | Status | Evidence | Follow-up |
|---|---|---|---|
| `.env` and local env files excluded from git | ✅ Pass | `.gitignore` excludes `.env`, `.env.local`, and `.env.*.local`. | Keep this policy; add pre-commit secret scanning. |
| Service-role key scoped to backend only | ✅ Pass | `SUPABASE_SERVICE_ROLE_KEY` used in ingestor service and server-side Python client, not frontend bundle. | Rotate key on schedule and document rotation runbook. |
| Secret scanning guardrail in repo | ⚠️ Gap | No repo-level secret scanning/pre-commit policy documented in checked files. | Add secret scan step (e.g., gitleaks/trufflehog) in CI and pre-commit hooks. |

## 5) Infra and deployment controls

| Check | Status | Evidence | Follow-up |
|---|---|---|---|
| Minimal container/env exposure | ✅ Pass | Compose injects only required env vars for `web` and `ingestor` (`infra/compose/docker-compose.yml`). | Continue principle-of-least-privilege env passing. |
| Deployment hardening checklist documented | ⚠️ Gap | `docs/deployment.md` includes env setup but no explicit security hardening checklist. | Add deployment security section (TLS, headers, access controls, logging retention). |

---

## Baseline Summary

- **Pass:** 6
- **Gap:** 8

Highest-priority gaps for next execution slice:
1. Add explicit web security headers policy.
2. Add automated dependency + secret scanning in CI.
3. Define API/rate-limit template before introducing public write endpoints.
4. Add deployment hardening + key-rotation runbook coverage.
