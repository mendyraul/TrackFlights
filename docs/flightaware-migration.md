# FlightAware Migration Plan

This is the clean way to remove the Raspberry Pi from the critical path without
throwing away the existing TrackFlights ingestion pipeline.

## What changed in code

- Added a new ingestor provider: `flightaware`
- Reused the existing poller, diff engine, Supabase client, and web snapshot path
- Kept ADS-B support intact for future local-radio mode

## Runtime configuration

Set these in the ingestor environment:

```bash
FLIGHT_PROVIDER=flightaware
FLIGHT_API_KEY=your-flightaware-aeroapi-key
FLIGHT_API_BASE_URL=https://aeroapi.flightaware.com/aeroapi
POLL_INTERVAL_SECONDS=300
```

Notes:
- `300` seconds is a sane starting point for a paid hosted API. Tighter polling
  will raise cost quickly.
- Weather, retention, and Supabase variables stay unchanged.

## AeroAPI assumptions in this first slice

The provider is written against FlightAware AeroAPI airport boards:

- `GET /airports/{airport}/flights/arrivals`
- `GET /airports/{airport}/flights/departures`
- auth via `x-apikey`

The normalizer accepts the field shapes commonly used in AeroAPI examples:

- `ident_iata` / `ident_icao`
- `origin` / `destination`
- `scheduled_out`, `actual_out`, `scheduled_in`, `actual_in`, `estimated_in`
- `last_position`
- `terminal_origin`, `gate_origin`, `terminal_destination`, `gate_destination`

If Raul's actual AeroAPI tier returns slightly different board keys, the provider
only needs a small adapter patch in `flightaware_provider.py`, not a pipeline rewrite.

## Pi decommission sequence

This host has already been cleaned back to one canonical systemd unit:

- removed stale `trackflights-ingestor.service`
- disabled `mia-ingestor.service`

Recommended next production cutover:

1. Point the canonical ingestor env at FlightAware + the correct Supabase project.
2. Run `pytest apps/ingestor/tests -q`.
3. Start only `mia-ingestor.service`.
4. Confirm successful polling in `journalctl -u mia-ingestor -f`.
5. Verify fresh rows in `flights_current` and a healthy `/api/flights/snapshot`.
6. Leave ADS-B hardware/docs in the repo as an optional future mode, not the default path.

## Why this path is better right now

- Removes the dead SDR/readsb dependency from production
- Removes single-Pi radio placement/hardware maintenance from the launch path
- Keeps the existing Supabase + web architecture intact
- Makes recovery simpler because one hosted API failure is easier to debug than
  broken RF, USB SDR hardware, local decoder software, and duplicate systemd drift
