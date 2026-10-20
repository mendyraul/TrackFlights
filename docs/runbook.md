# Runbook: when the map goes stale

The header tells you which side to look at:

| Header says | Meaning | Look at |
|---|---|---|
| **Receiver online** | Heartbeat fresh, aircraft heard | Nothing to do |
| **No signal** | Ingestor polling, decoder reports zero aircraft | Antenna, SDR, readsb |
| **Receiver offline** | No new data for 15+ min | Ingestor, Pi, network, Supabase |
| **API unreachable** | `/api/flights/snapshot` failing | Vercel, Supabase |

## 1. Is Supabase up?

```bash
curl -s https://track-flights-web.vercel.app/api/healthz/ready
curl -s https://track-flights-web.vercel.app/api/flights/snapshot | head -c 200
```

A 503 from the snapshot usually means the database is unreachable. Free-tier projects pause
after a week without activity and stop resolving in DNS; restore the project from the Supabase
dashboard.

## 2. Is the radio hearing anything? (on the Pi)

```bash
curl -s http://127.0.0.1:8080/data/aircraft.json | jq '.aircraft | map(select(.lat)) | length'
```

Use `http://127.0.0.1/tar1090/data/aircraft.json` on a readsb + tar1090 install. Dozens of
aircraft means the radio is fine. Zero or an error: check the SDR is plugged in
(`lsusb | grep -i rtl`) and `systemctl status readsb` (or `dump1090-fa`).

## 3. Is the ingestor running?

```bash
systemctl status mia-ingestor-adsb --no-pager
journalctl -u mia-ingestor-adsb -n 60 --no-pager
```

Each poll logs `ADS-B snapshot` with `received`, `in_range_active` and `emitted`. Common causes
of a stopped service: the unit's `User=` doesn't exist (newer Pi OS has no `pi` user), a wrong
`SUPABASE_URL`, or a rotated key in `.env`.

## 4. Are the database jobs running?

```sql
select jobname, schedule, active from cron.job;
select jobname, status, start_time from cron.job_run_details order by start_time desc limit 10;
```

If `flights_current` keeps growing or history stays empty, the jobs aren't scheduled; re-run the
migrations in `supabase/migrations/`.

## Rolling back the site

Vercel dashboard → Deployments → previous deployment → **Promote to Production**, or
`vercel rollback <deployment-url>`.

## Alerting

Set `HEARTBEAT_PING_URL` in the Pi's `.env.adsb` to a free healthchecks.io check. The ingestor
pings it at most once a minute while the radio hears aircraft, so the check alerts when the
ingestor, the decoder or the antenna stops.
