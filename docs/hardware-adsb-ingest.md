# Self-Hosted ADS-B Ingest — Hardware Guide (KMIA, 1090 MHz)

This is the receiving station that feeds the `adsb1090` provider (see
[architecture](./architecture.md)). Aircraft broadcast position reports as **ADS-B on
1090 MHz** (Mode S Extended Squitter). A Raspberry Pi with a software-defined radio (SDR)
decodes those broadcasts locally — no external API, no per-call quota, full control of the data.

> Band choice: KMIA is an airliner hub, and airliners transmit on **1090 MHz**. The 978 MHz UAT
> band is US general-aviation only (below 18,000 ft) and is **optional/later** — not needed here.

## What I run

| Part | What I use |
|------|------------|
| SDR receiver | Generic RTL-SDR USB dongle |
| Antenna | 1090 MHz antenna, indoors, facing out a window |
| Compute | Raspberry Pi 3, running the decoder and the Python ingestor |

It works fine for the MIA area. The window placement blocks part of the sky, so range is
uneven by direction; the upgrades below are what I'd change first.

## Upgrade options (~$120–160 all in)

| Part | Recommended | Why |
|------|-------------|-----|
| SDR receiver | **FlightAware Pro Stick Plus** (orange) | Built-in 1090 MHz SAW filter **and** LNA. The integrated filter is the big win near a busy airport / urban RF (cell, pager, FM). |
| Antenna | **FlightAware 1090 MHz antenna** (26", N-type) | Properly tuned to 1090 MHz; outdoor-rated. The single biggest range factor is mounting it with clear sky view. |
| Bandpass filter | **FlightAware 1090 MHz filter** (light blue) | Belt-and-suspenders rejection of out-of-band interference. Optional if using the Pro Stick **Plus** (already filtered), but cheap insurance in noisy RF. |
| Coax | Short **LMR-240** (or RG6) with correct connectors (SMA ↔ N) | Low loss; keep the run as short as possible — every meter of cheap coax costs you range. |
| Compute | **Raspberry Pi 4 (2 GB+)**, quality SD card or USB-SSD, 3A USB-C PSU | Pi 4 handles readsb + the Python ingestor comfortably. SSD if you also run `tar1090` history. |
| Misc | USB extension (move SDR away from Pi USB3 noise), outdoor mount, weatherproofing | USB3 ports radiate at ~1 GHz and desensitize the SDR — keep the dongle on a short USB2 extension away from the Pi. |

A Pi 3 runs readsb and the ingestor fine; a Pi 4 only matters if you also keep long tar1090
history or run other services on it.

## Placement (this matters more than the gear)
- **Line of sight to the horizon** is everything — ADS-B is ~line-of-sight VHF/UHF behavior. Roof
  or attic > windowsill. Even a few feet of height materially extends range.
- Keep the antenna vertical and away from large metal obstructions.
- Minimize coax length; put the (filtered) amp/SDR near the antenna feed if possible.
- **Grounding / lightning:** an outdoor antenna needs proper grounding and ideally a lightning
  arrestor inline. Don't skip this on a roof mount.

## Software on the Pi
1. **Decoder: [`readsb`](https://github.com/wiedehopf/readsb)** (modern, actively maintained;
   `dump1090-fa` is the FlightAware alternative). The wiedehopf install scripts are the easy path.
2. readsb publishes a live JSON feed (~1 Hz) at:
   - `http://<pi>:8080/data/aircraft.json` (with `tar1090`), or
   - `/run/readsb/aircraft.json` / `/run/dump1090-fa/aircraft.json` on disk.
3. **Optional:** `tar1090` for a local web map to eyeball reception/range.

### Quick reception test (before any database work)
```bash
# On the Pi, confirm the decoder is producing positions:
curl -s http://127.0.0.1:8080/data/aircraft.json | jq '.aircraft | map(select(.lat)) | length'
```
A healthy KMIA-area station should show dozens of aircraft with `lat`/`lon` during the day. If
this is empty, fix antenna/placement **first** — the ETL can't ingest what the radio can't hear.

## How it connects to TrackFlights
The Pi runs two services (see [`etl-pipeline.md`](./architecture.md) and
`infra/systemd/`): `readsb` (decode) and the existing **ingestor** with
`FLIGHT_PROVIDER=adsb1090`, which reads `ADSB_JSON_URL` and pushes to Supabase. Those writes are
**ingress** and do not consume the Supabase egress budget — the egress controls live on the read
side (see [`cost-guardrails.md`](./cost-guardrails.md)).
