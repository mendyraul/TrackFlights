# Deployment Guide

## Frontend (Vercel)

1. Connect your GitHub repo to Vercel
2. Set root directory to `apps/web`
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SNAPSHOT_REFRESH_SECONDS=120` (map snapshot CDN window)
   - `DASHBOARD_SUMMARY_REFRESH_SECONDS=300` (dashboard summary CDN window)
4. Deploy — Vercel auto-builds on push to `main`

## Database (Supabase)

1. Create a new Supabase project at https://supabase.com
2. Run migrations:
   ```bash
   npx supabase link --project-ref your-project-ref
   npx supabase db push
   ```
3. Enable Realtime on `flights_current` table
4. Copy the project URL and anon key to your `.env` files
5. Verify the analytics rollup cron jobs exist (added by
   `20260710120000_analytics_rollups.sql`):
   ```sql
   select jobname, schedule from cron.job;
   ```
   If pg_cron could not be enabled on the project, the four rollup functions
   still exist and can be invoked via RPC from the ingestor instead.

> **Free-tier note:** paused projects (1 week of inactivity) stop resolving
> DNS entirely — the web app shows 503s from `/api/*` routes and the ingestor
> logs connection errors. Restore the project from the Supabase dashboard.

## Ingestor (Raspberry Pi) — two services

Production runs two ingestor processes against the shared `flights_current`
table:

| Unit | Provider | Interval | Owns |
|---|---|---|---|
| `mia-ingestor-adsb` | `adsb1090` (local PiAware/dump1090) | 15 s | live positions, weather |
| `mia-ingestor-aeroapi` | `flightaware` (AeroAPI boards) | 4 h | schedules, delays, cancellations, gates, predictions |

Setup:

```bash
# On the Raspberry Pi, from the repo root
cp infra/systemd/env.adsb.example .env.adsb        # set ADSB_JSON_URL to your feeder
cp infra/systemd/env.aeroapi.example .env.aeroapi  # budget/cadence overrides
# Put the AeroAPI key in the shared .env as FLIGHT_API_KEY.
# Remove FLIGHT_PROVIDER / POLL_INTERVAL_SECONDS from the shared .env —
# the per-unit env files own those now.

sudo cp infra/systemd/mia-ingestor-adsb.service /etc/systemd/system/
sudo cp infra/systemd/mia-ingestor-aeroapi.service /etc/systemd/system/
# Edit both unit files if your checkout path/user differ from the template.
sudo systemctl daemon-reload
sudo systemctl disable --now mia-ingestor        # retire the single-provider unit
sudo systemctl enable --now mia-ingestor-adsb mia-ingestor-aeroapi

# Check status
journalctl -u mia-ingestor-adsb -f
journalctl -u mia-ingestor-aeroapi -f
```

### Option B: Docker

```bash
docker compose -f infra/compose/docker-compose.yml up -d ingestor-adsb ingestor-aeroapi
```

## AeroAPI cost calibration (first 48h)

The budget guard assumes `AEROAPI_COST_PER_QUERY_USD=0.02`. After the first
day of polling, compare `aeroapi_queries_mtd` from the ingestor logs against
the FlightAware portal's usage page and correct the env var. The guard halts
polling at `AEROAPI_MONTHLY_BUDGET_USD` regardless, so a wrong assumption
costs coverage, never money.

## Monitoring

- **Ingestor logs**: `journalctl -u mia-ingestor-adsb -f` / `journalctl -u mia-ingestor-aeroapi -f`
  - AeroAPI spend: look for `aeroapi_spend_mtd_usd` / `aeroapi_projected_month_usd`
- **Supabase dashboard**: egress + DB size weekly (free tier: 5 GB/mo egress, 500 MB DB)
- **Preflight**: `npm run ops:supabase-free-tier` before each release
- **Vercel dashboard**: Monitor frontend deployments and analytics

## Security Hardening (Phase 4)

Use the production checklist in [`docs/security-hardening-checklist.md`](security-hardening-checklist.md) before every release cut.
