# Security Hardening Checklist (Phase 4 Slice A)

Purpose: ship a repeatable, auditable baseline before production scale-up.

## 1) Web Security Headers (Vercel / Next.js)

Implementation status (Phase 4 Slice C): baseline headers are now enforced in `apps/web/next.config.js` for all routes. Keep HSTS at the edge (Vercel) for production.

Target headers for all app routes:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Content-Security-Policy` (start with report-only, then enforce)

CSP baseline draft:

```text
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
font-src 'self' data:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

Verification commands:

```bash
curl -sI https://<prod-domain> | grep -Ei "strict-transport|content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy"
```

## 2) Rate Limiting + Abuse Protection

- Apply per-IP and per-route limits at the edge for API endpoints.
- Protect expensive endpoints (search/filter/reporting) with stricter thresholds.
- Return `429` with clear retry hints.
- Log throttling events and alert if a threshold is exceeded.

Minimum thresholds (starter):

- Read-heavy endpoints: 60 req/min/IP
- Heavy endpoints: 20 req/min/IP
- Admin/ops endpoints: 10 req/min/IP

## 3) Secret Hygiene

- Never commit `.env` files or plaintext secrets.
- Vercel env vars only in dashboard/project settings.
- Supabase service-role key must never be exposed to the browser.
- Rotate leaked/old keys immediately.
- Add secret scanning in CI and block on findings.

Preflight checks:

```bash
git grep -nE "(SUPABASE_SERVICE_ROLE|API_KEY|SECRET|TOKEN)" . ':!package-lock.json'
```

## 4) Dependency & Supply-Chain Audit

- Run `npm audit --omit=dev` for production dependency risk.
- Run `pip-audit` for Python ingestor environment.
- Upgrade high/critical vulnerabilities before release.
- Pin versions where feasible and document exceptions.

Commands:

```bash
npm audit --omit=dev
python -m pip install pip-audit && pip-audit
```

## 5) Database / Supabase Security

- Row Level Security enabled on user-facing tables.
- Realtime channels scoped to least privilege.
- Restrict broad table grants.
- Ensure service-role usage stays server-side only.

Checklist:

- [ ] RLS enabled for all external-facing tables
- [ ] Auth policies reviewed for least privilege
- [ ] Public anon key usage audited (frontend-safe only)
- [ ] Service role key usage confirmed backend-only

## 6) Release Gate (Security)

Before production release:

- [ ] Header verification pass on production URL
- [ ] Rate limiting enabled on all API routes
- [ ] Secret scan clean
- [ ] `npm audit` and `pip-audit` reviewed
- [ ] Supabase policy review complete

Owner: Rico  
Status: Draft baseline committed in Phase 4 Slice A

## Baseline Summary Snapshot (Issue #19)
- Pass: 6
- Gap: 8
- Priority remediations: headers policy, dependency/secret scanning in CI, API/rate-limit template, deployment hardening + key rotation runbook.
