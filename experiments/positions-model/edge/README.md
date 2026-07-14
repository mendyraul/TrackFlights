# TrackFlights — Edge (Raspberry Pi)

The edge node of TrackFlights. Runs on a Raspberry Pi 3 with an RTL-SDR + 1090 MHz
antenna and a u-blox GPS HAT. It:

- decodes ADS-B locally (`dump1090-fa` → `aircraft.json`),
- **feeds FlightAware** in parallel via `piaware` (claim a free Enterprise account),
- streams throttled/batched telemetry into cloud **Supabase** (positions model),
- auto-registers the receiver's location from the **GPS HAT**, and disciplines the
  clock from the **PPS** pulse for high-accuracy MLAT.

The web UI lives in a separate repo (`trackflights-web`, deployed to Vercel) and reads
from the same Supabase project.

## Architecture

```
Antenna → RTL-SDR → dump1090-fa → aircraft.json ─┐
                                                 ├─► piaware ─► FlightAware
GPS HAT → /dev/serial0 (NMEA) ───► station fix ──┤
PPS pin → /dev/pps0 ─────────────► chrony (µs)   │
                                                 └─► src/main.py (ETL) ─► Supabase
                                                       throttle + batch     (tracked_flights,
                                                                              flight_positions,
                                                                              receiver_stations)
```

## Data model (Supabase)

Run `supabase/migrations/0001_tracked_flights_positions.sql` in the Supabase SQL Editor:

- **`tracked_flights`** — one row per aircraft (ICAO `hex`), latest state. The map reads this.
- **`flight_positions`** — append-only trail (time-series), short retention.
- **`receiver_stations`** — this Pi's coordinates, auto-filled from GPS.

RLS: anon = read-only; the ETL writes with the service role key.

## ETL design

`src/worker/position_streamer.py`:

1. read `aircraft.json` every `STREAM_READ_INTERVAL_SECONDS` (~1s),
2. **throttle** per aircraft to one sample per `POSITION_THROTTLE_SECONDS` (10–15s),
3. **batch** and flush every `FLUSH_INTERVAL_SECONDS` (or at `BATCH_MAX_ROWS`) →
   bulk insert `flight_positions` + upsert `tracked_flights`,
4. periodically register the station and prune old positions
   (`POSITIONS_RETENTION_HOURS`, `TRACKED_STALE_MINUTES`).

All knobs live in `src/config.py` / `.env` (see `.env.example`).

## Pi setup

```bash
git clone <this-repo> ~/trackflights-edge && cd ~/trackflights-edge
sudo bash scripts/setup-pi.sh      # decoder + piaware + PPS/GPS UART + chrony + venv
sudo reboot                        # apply UART/PPS/Bluetooth changes
```

After reboot, verify:

```bash
sudo ppstest /dev/pps0                                   # PPS pulses
cat /dev/serial0                                         # GPS NMEA sentences
curl -s localhost:8080/data/aircraft.json | head         # decoder feed
piaware-status                                           # FlightAware feed
```

Claim your free feeder at <https://flightaware.com/adsb/piaware/claim>.

## Run the ETL

```bash
cp .env.example .env       # fill in Supabase creds + station/GPS
.venv/bin/python -m src.main
```

### As a service (auto-start, auto-restart)

```bash
sudo cp systemd/trackflights-edge.service /etc/systemd/system/
# edit User/paths in the unit if you didn't clone to /home/pi/trackflights-edge
sudo systemctl daemon-reload
sudo systemctl enable --now trackflights-edge
journalctl -u trackflights-edge -f
```

Cap journald so logs can't fill the SD card — in `/etc/systemd/journald.conf` set
`SystemMaxUse=200M`, then `sudo systemctl restart systemd-journald`.

## Tests

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/pytest tests -q
```

## Future scaling (modular hooks)

- **Dual-frequency (978 MHz UAT):** add a `Uat978Provider` beside `adsb1090`; assign
  distinct SDR serials with `rtl_eeprom` so `dump1090-fa` (1090) and `uat2es` (978)
  don't fight over USB. The provider abstraction (`src/providers/`) already supports this.
- **High-gain antenna + LNA:** the throttle + batch + retention design bounds the row
  surge as coverage grows (~30 → ~250 mi); tune `BATCH_MAX_ROWS` / retention, no code change.
