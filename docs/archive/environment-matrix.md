# Environment Matrix + Secrets Mapping (Issue #10 / Phase 1 Slice C)

This document defines **what variable lives where**, who owns it, and how to validate it without leaking secrets.

## 1) Variable ownership map

| Variable | Scope | Runtime(s) | Secret? | Source of truth | Notes |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Frontend public | Vercel web build/runtime | No (public URL) | Vercel Project Env | Required for client Supabase init |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Frontend public | Vercel web build/runtime | Low sensitivity (public anon key) | Vercel Project Env | Must be anon key, never service-role |
| `SUPABASE_URL` | Server-side | Ingestor (Pi), CI for ingestor tests | Yes | Pi `.env` / GitHub Actions secret | Should match project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side | Ingestor (Pi), CI for ingestor tests | **Yes (high)** | Pi `.env` / GitHub Actions secret | Never exposed to browser bundles |
| `FLIGHT_API_KEY` | Server-side | Ingestor (Pi), CI if integration tests are added | Yes | Pi `.env` / GitHub Actions secret | Provider API key |
| `FLIGHT_API_BASE_URL` | Server-side config | Ingestor | No | Pi `.env` | Default: AviationStack base URL |
| `FLIGHT_PROVIDER` | Server-side config | Ingestor | No | Pi `.env` | `aviationstack` or `example` |
| `POLL_INTERVAL_SECONDS` | Server-side config | Ingestor | No | Pi `.env` | Keep >= 30 in production to avoid rate spikes |
| `MIA_IATA_CODE` | Server-side config | Ingestor | No | Pi `.env` | Default `MIA` |
| `MIA_ICAO_CODE` | Server-side config | Ingestor | No | Pi `.env` | Default `KMIA` |
| `WEATHER_ENABLED` | Server-side config | Ingestor | No | Pi `.env` | `true`/`false` |
| `WEATHER_PROVIDER` | Server-side config | Ingestor | No | Pi `.env` | Default `openmeteo` |
| `WEATHER_POLL_INTERVAL_SECONDS` | Server-side config | Ingestor | No | Pi `.env` | Suggested >= 300 |
| `PREDICTIONS_ENABLED` | Server-side config | Ingestor | No | Pi `.env` | Feature flag |
| `ANOMALY_DETECTION_ENABLED` | Server-side config | Ingestor | No | Pi `.env` | Feature flag |
| `SENTRY_DSN` | Optional telemetry | Web and/or ingestor | Yes | Vercel/Pi secret stores | Leave empty when not configured |

## 2) Where to configure each environment

### A) Vercel (web)
Set only frontend/public variables for the web app:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- optional `SENTRY_DSN` (if web telemetry is enabled)

Do **not** set `SUPABASE_SERVICE_ROLE_KEY` in web runtime.

### B) Raspberry Pi ingestor
Set server-side runtime variables in the ingestor service environment file (`.env` or systemd EnvironmentFile):
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLIGHT_API_KEY`
- operational flags and polling intervals

### C) GitHub Actions
For CI jobs that need secret-backed integration coverage, use repository secrets:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FLIGHT_API_KEY`

Current baseline CI is intentionally placeholder-safe for unit/static checks and should not require production secrets for normal PR validation.

## 3) Guardrails

1. Keep `.env.example` committed with **names + placeholders only**.
2. Never commit real `.env` files.
3. Never expose `SUPABASE_SERVICE_ROLE_KEY` or provider API keys to browser code.
4. Prefer short-lived credential rotation windows for service keys.
5. If a secret is leaked, rotate immediately and invalidate old key.

## 4) Quick verification checklist (owner runbook)

- [ ] Vercel project has both `NEXT_PUBLIC_*` Supabase vars set for `Production` and `Preview`.
- [ ] Pi ingestor environment has service-role + flight API key populated.
- [ ] `.env.example` still contains placeholders only.
- [ ] `npm run ci:baseline` passes without needing production secrets.
- [ ] No secret values appear in logs (`git grep -n "SUPABASE_SERVICE_ROLE_KEY\|FLIGHT_API_KEY" -- . ':!*.example'`).

## 5) Rotation policy (minimum)

- Rotate `FLIGHT_API_KEY` on provider compromise or quarterly.
- Rotate `SUPABASE_SERVICE_ROLE_KEY` on any suspicion of exposure.
- Record rotation date and owner in internal ops notes (not in git).
