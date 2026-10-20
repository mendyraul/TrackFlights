# Architecture

The README has the diagram and the main tradeoffs. This page is the reference for how the
pieces fit together.

## Data path

1. **Receiver (Pi).** An RTL-SDR and a 1090 MHz antenna feed readsb or dump1090-fa, which
   rewrites `aircraft.json` about once a second.
2. **Ingestor (Pi, `apps/ingestor`).** Every 15 s it reads `aircraft.json` and drops aircraft
   with no position in the last 60 s, beyond 200 km of KMIA, or that moved under 150 m since
   their last write. It infers each aircraft's phase, converts the callsign to an IATA ident,
   diffs against an in-memory copy of `flights_current`, and upserts what changed. It also
   writes a heartbeat row and the current hour's traffic stats (with weather) every poll.
   Optional, all set in `.env.adsb`:
   - `TRACK_LOG_PATH`: samples every in-range aircraft into a local SQLite file (classifier
     training data; never leaves the Pi). Capped by `TRACK_LOG_*` limits.
   - `PHASE_MODEL_PATH`: a trained classifier replaces the phase rules; its phase is stored in
     `raw_data.phase` with the model version.
   - `FORECAST_MODEL_PATH`: once an hour, forecasts the next 6 hours into `traffic_forecast`.
3. **Database (Supabase Postgres).** Writes are ingress and aren't metered. pg_cron jobs
   archive finished flights, purge rows that stopped updating, roll up history, and prune
   old rollups, all inside the database.
4. **API (`apps/web/src/app/api`, Vercel).** `/api/flights/snapshot` returns up to 250 aircraft
   (most recently updated first), the newest row's timestamp and the ingestor heartbeat.
   `/api/dashboard/summary` returns traffic history and weather. Both are cached by Vercel's
   CDN (30 s and 300 s), so database reads scale with CDN regions, not viewers.
5. **Browser.** One shared poller (`useFlights`) fetches the snapshot every 15 s for the
   header, map, board and analytics. Airline, phase and distance are derived client-side
   from ADS-B fields.

## Tables

| Table | Written by | Purpose |
|---|---|---|
| `flights_current` | ingestors | One row per flight ident (hex when no callsign); live position and state |
| `flights_history` | pg_cron archive job | Finished flights, kept 7 days |
| `traffic_hourly` | ADS-B ingestor via `record_traffic_hour()` | Per-hour unique aircraft by phase, peak, range, weather |
| `traffic_forecast` | ADS-B ingestor (forecast model) | Predicted aircraft for the next 6 hours, with the model's held-out error |
| `traffic_anomalies` | pg_cron `detect_traffic_anomalies()` | Unusually busy/quiet hours (robust z vs same hour of week) |
| `ingestor_heartbeat` | ingestors | Last poll time and aircraft counts, for the status indicator |
| `weather_snapshots` | ADS-B ingestor (Open-Meteo) | Hourly weather at MIA |
| `analytics_hourly` / `_daily` | pg_cron rollups | Schedule-based stats; only filled by the AeroAPI feed |

Every table has RLS with public read only. Writes use the service-role key, which exists only
on the Pi. Write-capable SQL functions are executable only by `service_role`.

## Optional schedule feed

A second ingestor unit (`mia-ingestor-aeroapi`) can poll FlightAware AeroAPI every 4 hours for
schedules, delays and gates, under a hard monthly budget guard. Its rows merge with ADS-B rows
on the flight ident. The site shows schedule data only where it exists.

## Freshness

The site calls data "live" when the heartbeat is under 2 minutes old and the decoder reported
aircraft, or, without a heartbeat, when the newest row is under 2 minutes old. A fresh heartbeat
with zero aircraft is "no signal" (radio side). After 15 minutes without new data it shows
"Receiver offline" with the last data time.

## Models

Training lives in `apps/ml` (laptop only); serving lives in the ingestor (`src/ml`). Feature
code is shared, models ship as JSON, and each model only switches on if it beat its baseline on
held-out days. See `apps/ml/README.md` for the commands.
