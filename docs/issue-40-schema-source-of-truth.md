# Issue #40 — Supabase schema source of truth

Required public tables for runtime:
- `flights_current`
- `analytics_hourly`
- `analytics_daily`
- `traffic_anomalies`

## Canonical definition
- `supabase/migrations/00001_initial_schema.sql`
- `supabase/migrations/00002_weather_predictions_anomalies.sql`

## Smoke check
Run:

```bash
npm run smoke:schema
```

Behavior:
- If `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set, checks Supabase REST reachability for each required table and fails on `PGRST205`/API errors.
- If env vars are missing, falls back to migration-source verification and confirms required `CREATE TABLE` definitions exist under `supabase/migrations`.

## CI/preview guard
- Workflow: `.github/workflows/schema-smoke.yml`
- Auto-runs on PRs to `dev` when migrations or schema-smoke files change.
- Supports manual `workflow_dispatch` checks after deploy.
- Uses repo secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` when available for real endpoint validation.
