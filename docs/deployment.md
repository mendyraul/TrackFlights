# Deployment Guide

## Frontend (Vercel)

1. Connect your GitHub repo to Vercel
2. Set root directory to `apps/web`
3. Set environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SNAPSHOT_REFRESH_SECONDS=30` (map snapshot CDN window; the code default)
   - `DASHBOARD_SUMMARY_REFRESH_SECONDS=300` (dashboard summary CDN window)
4. Deploy — Vercel auto-builds on push to `main`

## Database (Supabase)

1. Create a new Supabase project at https://supabase.com
2. Run migrations:
   ```bash
   npx supabase link --project-ref your-project-ref
   npx supabase db push
   ```
3. Copy the project URL and anon key to your `.env` files
4. Verify the analytics rollup cron jobs exist (added by
   `20260710120000_analytics_rollups.sql`):
   ```sql
   select jobname, schedule from cron.job;
   ```
   If pg_cron could not be enabled on the project, the four rollup functions
   still exist; run them from the SQL editor or a scheduled job instead.

> **Free-tier note:** paused projects (1 week of inactivity) stop resolving
> DNS entirely — the web app shows 503s from `/api/*` routes and the ingestor
> logs connection errors. Restore the project from the Supabase dashboard.

## Ingestor — two services (Raspberry Pi or a Linux container)

Production uses separate receiver observations, morning schedule baselines, and inferred progress; the legacy `flights_current` table remains for compatibility:

| Unit | Provider | Interval | Owns |
|---|---|---|---|
| `mia-ingestor-adsb` | `adsb1090` (local PiAware/dump1090) | 15 s | live positions, weather |
| `mia-ingestor-aeroapi` | `flightaware` | 15 min worker wake | five morning airport boards at 04:00 Miami time; daily regional snapshot after 12 UTC |

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

### Option A2: a Proxmox LXC (or any small Linux VM)

The ingestor only needs Python 3.11+, outbound HTTPS to Supabase, and HTTP to
the dump1090 feeder, so it doesn't have to run on the Pi with the antenna. A
Debian 12 unprivileged LXC with 1 vCPU, 512 MB of RAM and 8 GB of disk is
plenty. Turn on `nesting=1`: Debian 12's systemd expects it, and the units use
`PrivateTmp`/`NoNewPrivileges`.

```bash
# In the container, as root
apt-get install -y git python3-venv python3-pip
useradd --system --create-home --home-dir /opt/trackflights --shell /usr/sbin/nologin ingestor
runuser -u ingestor -- git clone https://github.com/mendyraul/TrackFlights.git /opt/trackflights/repo
cd /opt/trackflights/repo/apps/ingestor
runuser -u ingestor -- python3 -m venv venv
runuser -u ingestor -- venv/bin/pip install -r requirements.txt
```

Copy `.env` from the old host **directly host to host** (it holds the
service-role key, so don't paste it anywhere), then `chmod 600` it, owned by
`ingestor`. Create `.env.adsb` from `infra/systemd/env.adsb.example` with
`ADSB_JSON_URL` pointing at the feeder's IP. Install the units from
`infra/systemd/`, changing `User`/`Group` to `ingestor` and the paths to
`/opt/trackflights/repo`.

Cut over without overlap. Two ADS-B ingestors would both write:

```bash
# old host
sudo systemctl disable --now mia-ingestor mia-ingestor-adsb
# container
systemctl enable --now mia-ingestor-adsb
journalctl -u mia-ingestor-adsb -f        # "ADS-B snapshot ... received=N" and "Poll cycle complete"
curl -s https://<your-vercel-app>/api/healthz/data   # "freshness":"live"
```

### Upgrading an existing host

1. **Apply new Supabase migrations first.** Newer code writes tables that
   older databases don't have. Those writes fail with `PGRST205 ... schema
   cache`, while flight upserts keep working. Run `supabase db push`, or paste
   the new files from `supabase/migrations/` into the SQL editor in order.
2. `git pull` as the service user, then `venv/bin/pip install -r requirements.txt`.
3. **Check `.env` for retired keys.** Settings read `.env` directly and
   reject keys they don't define (pydantic `extra_forbidden`). For example,
   `PREDICTIONS_ENABLED` and `ANOMALY_DETECTION_ENABLED` were removed and now
   stop the service at start. Values passed by systemd `EnvironmentFile`
   lines are only ignored.
4. Restart the unit and watch the first few cycles.

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
- **Free-tier check**: `npm run ops:supabase-free-tier`
- **When something looks stale**: [runbook.md](runbook.md)
- **Vercel dashboard**: Monitor frontend deployments and analytics

For the morning airport explorer, apply the airport-board migration before deploying workers and follow [the rollout guide](flightaware-rollout.md). Airport clicks only read cached baselines. The receiver worker independently records inferred flight progress; provider schedule fields are not changed by inference.
