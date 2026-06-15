# Production Readiness Assessment

_Last updated: 2026-06-14 — assessed at `main` commit `f7d3bec` (PR #70 merged)._

This is the single go-live source of truth: **what is already production-ready in
the codebase** vs **what still requires a human/owner action** before and during a
production release. For the step-by-step deploy procedure see
[`release-checklist.md`](./release-checklist.md); for security verification detail
see [`security-hardening-checklist.md`](./security-hardening-checklist.md).

---

## TL;DR

**Engineering / code: GREEN.** CI is green on `main`, the web app builds, both test
suites pass, linters/formatters are clean, the DB schema ships with RLS, and the
ingestor implements free-tier retention pruning. Nothing in the code blocks a
production deploy.

**Remaining work is operational** — toggles, secrets, alerts, and verifications that
can only be performed by the repo/infra owner against the live GitHub / Vercel /
Supabase / Raspberry Pi environments. Those are tracked in
[§ Owner action list](#owner-action-list) below.

---

## What is production-ready (verified on `main` @ `f7d3bec`)

| Area | Status | Evidence |
|------|--------|----------|
| Web build | ✅ | `npm run build --workspace=apps/web` succeeds (static + dynamic routes) |
| Web typecheck | ✅ | `npx tsc --noEmit` clean |
| Web lint / format | ✅ | ESLint clean; Prettier `format:check` clean |
| Web tests | ✅ | vitest — 6 passed (useFlights, snapshot route, ErrorBoundary) |
| Ingestor tests | ✅ | pytest — 20 passed |
| Ingestor lint / format | ✅ | ruff clean; black clean |
| CI on `main` | ✅ | `.github/workflows/ci.yml` triggers on `main`; all jobs green on the merge commit |
| Security gates | ✅ | npm audit + pip-audit jobs + gitleaks secret scan all pass |
| DB Row Level Security | ✅ | RLS enabled on all tables in `supabase/migrations/*`; public-read SELECT policies, writes restricted to service role |
| Free-tier retention | ✅ | `SupabaseClient.prune_old_data()` deletes aged history/weather/anomaly rows; poller runs it daily (86400s) |
| Egress-safe read path | ✅ | `/api/flights/snapshot` is CDN-cached; viewer count decoupled from Supabase egress; realtime intentionally off |
| Deployment infra | ✅ | `infra/docker/*`, `infra/compose/docker-compose.yml`, `infra/systemd/mia-ingestor.service` present |
| Cost guardrails | ✅ | `docs/cost-guardrails.md` egress budget; tightened poll intervals (10800s) + retention defaults |

---

## Owner action list

These are **not** code changes — they are configuration/verification steps that need
production credentials or the live consoles. Check each off during the go-live window.
Sourced from `release-checklist.md` and `security-hardening-checklist.md`.

### 1. Repository / CI governance
- [ ] Apply branch protection on `main` (require PR + green CI; no direct pushes).
      See `docs/branch-protection.md` for exact required-check context.

### 2. Secrets & environment
- [ ] Set all required env vars in **Vercel** (web): `NEXT_PUBLIC_SUPABASE_URL`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SNAPSHOT_REFRESH_SECONDS`, `SENTRY_DSN` (optional).
- [ ] Set all required env vars on the **Raspberry Pi** ingestor runtime:
      `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FLIGHT_PROVIDER`, ADS-B/poll/retention vars.
      (Full key list: `.env.example`.)
- [ ] Confirm the service-role key is **backend-only** (never shipped to the web bundle).

### 3. Database
- [ ] Apply migrations in order against the production Supabase project
      (`supabase/migrations/`), confirm no errors.
- [ ] Verify RLS is active on the live project and anon read access behaves as intended
      (policies exist in code — this step confirms they're applied in prod).

### 4. Monitoring & cost alerts
- [ ] Configure Vercel budget alerts (50% / 80% / 95%).
- [ ] Configure Supabase quota alerts (60% / 85% / 95%).
- [ ] Configure ingestor host capacity alerts (CPU / memory / disk) on the Pi.
- [ ] Confirm cost-escalation contact/channel.

### 5. Production verification (post-deploy)
- [ ] App loads in production; key pages render; arrivals/departures board shows sane data.
- [ ] Security headers verified on the production URL (config in `next.config`).
- [ ] Ingestor logs show successful polling, inserts, and the daily prune.
- [ ] Error rate does not spike after deploy.
- [ ] Run smoke scripts: `scripts/smoke-health-endpoints.sh`, `scripts/smoke-supabase-schema.sh`.

---

## Known code-level follow-ups

These were the two non-blocking items tracked at go-live. Both are now **addressed**:

1. **API rate limiting** — ✅ Done. Edge middleware (`apps/web/src/middleware.ts`) applies a
   per-IP fixed-window limit (default 120 req / 60 s, env-overridable via `RATE_LIMIT_MAX` /
   `RATE_LIMIT_WINDOW_MS`) across `/api/*`, returning `429` + `Retry-After`. In-memory
   per-instance (no KV on Vercel free tier) — a basic abuse guard layered on top of the
   CDN-cached snapshot route. See `security-hardening-checklist.md`.
2. **Generated DB types** — ✅ Tooling added. `apps/web/src/types/database.ts` remains the
   source of truth, but `npm run db:gen-types` regenerates types from the local schema and a
   CI/pre-commit drift guard (`scripts/check-types-drift.sh`) fails when a migration changes
   without a corresponding types update. See "Regenerating types after a migration" in
   `docs/database.md`.

---

## Branch hygiene snapshot (2026-06-14)

All real work is on `main`. Branches confirmed already-contained or superseded:
- `feature/adsb-ingest-and-audit-remediation` — merged via PR #70 (branch deleted).
- `feature/fix-python-audit-baseline` — already in `main` as #69 (merge is a no-op).
- `feature/reduce-supabase-egress` — already in `main` (cherry-equivalent; merge is a no-op).
- `feature/wip-rescue-20260605-trackflights` — its unique commits are a subset of PR #70.

Pending hygiene (owner): delete stale **remote** branch `origin/feature/reduce-supabase-egress`
and the local worktree at `/tmp/trackflights-audit-fix` (holds `feature/fix-python-audit-baseline`).
