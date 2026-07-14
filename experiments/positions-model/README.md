# Positions-Model Experiment (archived 2026-07-13)

On 2026-06-15 the monorepo was experimentally split into two standalone repos
(`trackflights-edge`, `trackflights-web`) that replaced the single
`flights_current` snapshot table with a **positions model**: a parent
`tracked_flights` row per aircraft plus an append-only `flight_positions`
trail, fed by a streaming ETL. The repos lived only on the production Pi and
were never pushed; their full trees (minus build artifacts) are preserved
here, and the originals have been deleted.

This experiment is NOT wired into the running app. Production remains the
monorepo path: ADS-B + AeroAPI ingestors → `flights_current`/`flights_history`
→ DB-side rollups → CDN-cached API routes.

## What it was trying to do

1. **Flight trails.** `flights_current` only stores each aircraft's latest
   position, so the map can never draw where a flight has been. The
   experiment appends one throttled sample per aircraft (~every 12s) to
   `flight_positions` and renders the flown trail as a polyline when you
   select an aircraft.
2. **Higher-frequency ingest on tiny hardware.** A streaming worker
   (`edge/src/worker/position_streamer.py`) reads `aircraft.json` at ~1 Hz,
   throttles per-aircraft, and bulk-inserts batches every ~20s — tuned for a
   Pi 3 with 1 GB RAM and Supabase free-tier write patterns. (The monorepo
   poller instead polls every 15s and uses a movement gate.)
3. **Automatic receiver location.** `edge/src/gps/` has a dependency-light
   NMEA parser + `StationLocator` that reads a u-blox GPS HAT on
   `/dev/serial0`, auto-registers the receiver's coordinates into a new
   `receiver_stations` table (static fallback if no fix), and uses the PPS
   pulse with chrony for microsecond clock accuracy — which is what good MLAT
   requires.
4. **Egress-safe reads for the new model.** `web/` repoints
   `/api/flights/snapshot` at `tracked_flights` (adapting rows server-side to
   the existing `Flight` shape so map/table components are untouched) and
   adds an edge-cached `/api/flights/[hex]/positions` route + `useFlightTrail`
   hook.

## Reusable pieces, in rough order of value

| Piece | Where | How it helps the monorepo |
|---|---|---|
| Flight-trail route + hook | `web/src/app/api/flights/[hex]/positions/`, `web/src/hooks/useFlightTrail.ts` | Add trails to the live map without per-viewer egress (same CDN pattern as our snapshot/summary routes) |
| `flight_positions` schema + retention | `edge/supabase/migrations/0001_tracked_flights_positions.sql` | The append-only trail table, RLS, and pruning could be added alongside `flights_current` (trail data is the one thing the current model cannot express) |
| GPS HAT support | `edge/src/gps/` (+ `scripts/setup-pi.sh`, `systemd/`) | Auto-register receiver location; PPS+chrony discipline if we ever feed MLAT-accurate data |
| Throttle/batch streamer | `edge/src/worker/position_streamer.py` + tests | If ADS-B cadence ever increases past the diff engine's comfort, per-aircraft time-throttling + bulk insert is the proven shape |
| Pi bootstrap script | `edge/scripts/setup-pi.sh` | One-shot dump1090-fa + piaware + GPS/PPS + venv setup for a fresh receiver Pi |

## Why it was not adopted wholesale

- It forked the repo (two unpushed local repos, no CI, no deploy path) and a
  second schema, while issues #77/#78 were solved on the monorepo with
  smaller changes (diff-engine fix, AeroAPI provider, DB-side rollups,
  cached summary route).
- The positions model has no schedule/delay/cancellation data, so the
  analytics dashboard (on-time %, delays) still needs the AeroAPI path — the
  experiment had to unlink the Analytics tab entirely.
- Write volume: ~1 sample/12s/aircraft grows the DB far faster than the
  diff-gated `flights_current` writes; fine with its pruning, but it needs
  care against the 500 MB free-tier cap.

## If you pick this up later

Start by porting only the trail: add `flight_positions` (+pruning) via a new
migration, teach the ADS-B provider to also append throttled samples, and
port the `[hex]/positions` route + `useFlightTrail`. That delivers the
visible feature (map trails) without adopting the tracked_flights fork.

Original commit messages are preserved in `edge/` and `web/` history notes
below (the source repos' git history was not retained here):

- `trackflights-edge` @ f964d37 — "feat: positions-model streaming ETL + GPS
  HAT + Pi setup" (37 tests passing)
- `trackflights-web` @ 725be1d — "feat: read positions model
  (tracked_flights) + flight trail; drop egress risk"
