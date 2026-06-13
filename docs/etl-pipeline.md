# ETL Pipeline — Pi ADS-B → Supabase (egress-safe)

How self-decoded ADS-B gets from the Raspberry Pi into Supabase and onto the map, while staying
inside the Supabase **free tier**. Hardware is covered in
[`hardware-adsb-ingest.md`](./hardware-adsb-ingest.md); budget thresholds in
[`cost-guardrails.md`](./cost-guardrails.md).

```
[antenna 1090MHz] → [SDR] → readsb (Pi)              ┌─ Supabase (Postgres) ─┐
        aircraft.json (~1 Hz, local HTTP)            │   flights_current      │
                  │                                   └────────────────────────┘
                  ▼  EXTRACT                                  ▲ writes = INGRESS
        ingestor: Adsb1090Provider                           │ (not egress-metered)
                  │  TRANSFORM (filter + normalize + gate)    │
                  ▼  LOAD (batch UPSERT, service role) ───────┘
                                                              │ reads = EGRESS (metered)
                                              ┌───────────────▼───────────────┐
                                              │ Next.js /api/flights/snapshot  │  ← Vercel CDN cache
                                              │   (one Supabase read / window) │     (shared by all
                                              └───────────────▲───────────────┘      viewers)
                                                              │
                                                      browsers poll the CDN
```

## The one idea that keeps us in free tier
**Writes from the Pi are ingress and are NOT counted against Supabase egress.** Egress is burned
only when something **reads out** of Supabase — i.e. the browser. So the entire egress strategy
is about the *read path*, not the Pi. See the budget math in
[`cost-guardrails.md`](./cost-guardrails.md#supabase-egress-budget-ads-b-mode).

## Extract — `Adsb1090Provider`
`apps/ingestor/src/providers/adsb1090_provider.py`. A **live position feed** provider
(`is_live_position_feed = True`), so the poller fetches one snapshot per cycle via
`fetch_live_positions()` instead of arrival/departure boards. It reads `ADSB_JSON_URL`
(readsb `aircraft.json`) over local HTTP with retry/backoff (`httpx` + `tenacity`).

## Transform — keep writes and DB footprint bounded
Inside `fetch_live_positions()` + `normalize()`:
1. **Position fix required** — drop aircraft without `lat`/`lon`.
2. **Freshness** — drop tracks whose `seen_pos`/`seen` exceeds `ADSB_MAX_SEEN_SECONDS` (default 60s).
3. **Range** — drop aircraft beyond `ADSB_MAX_RANGE_KM` of KMIA (default 200 km), via haversine.
4. **Movement gate** — skip an aircraft if it has moved < `ADSB_MIN_MOVE_METERS` (default 150 m)
   since the last emitted position. This is the main write-reduction lever.
5. **Normalize** readsb fields → canonical `flights_current` schema:
   `hex→raw_data/flight_iata fallback`, `flight→callsign/flight_iata`, `lat/lon`, `alt_baro→altitude_ft`
   (`"ground"→0`), `track→heading`, `gs→ground_speed_knots`, `baro_rate→vertical_speed_fpm`,
   `t→aircraft_icao`, `r→aircraft_registration`. **Direction** is inferred per-aircraft from
   vertical rate (descending ⇒ `arrival`, else `departure`); on-ground ⇒ `landed`.

> ADS-B carries **no** gate / scheduled-time / origin-destination board data. That board metadata
> is a separate, low-frequency, optional schedule source (e.g. a periodic AviationStack pull) and
> is out of scope for this pipeline. ADS-B drives the **live map layer**.

## Load — batch UPSERT
Reuses the existing diff engine + `SupabaseFlightClient.upsert_flights()`
(`apps/ingestor/src/services/supabase_client.py`): one UPSERT request per cycle, batched, keyed on
the `flights_current_flight_iata_key` unique index, using the service-role key. Aircraft that
leave range stop being upserted and are marked stale after ~10 min, so `flights_current` stays
bounded to in-range aircraft (hundreds of rows) — well under the **500 MB** DB cap.
`flights_history` should stay disabled or aggressively downsampled in ADS-B mode (full-rate
position history would overflow 500 MB in days).

## Configuration
`.env` (see `.env.example`):
```
FLIGHT_PROVIDER=adsb1090
ADSB_JSON_URL=http://127.0.0.1:8080/data/aircraft.json
ADSB_MAX_RANGE_KM=200
ADSB_MIN_MOVE_METERS=150
ADSB_MAX_SEEN_SECONDS=60
POLL_INTERVAL_SECONDS=10          # ADS-B is live; poll the local feed often (writes are free-ish)
SNAPSHOT_REFRESH_SECONDS=30       # web read cadence — drives egress (see cost-guardrails)
```
Note `POLL_INTERVAL_SECONDS` can be aggressive here (the source is local), unlike the ~3h default
used to throttle the paid AviationStack API.

## Running on the Pi
Two services (see `infra/systemd/`):
- `readsb` (decoder) — installed per [`hardware-adsb-ingest.md`](./hardware-adsb-ingest.md).
- `mia-ingestor.service` — the existing unit; just set `FLIGHT_PROVIDER=adsb1090` in the
  `EnvironmentFile` `.env`. No code/launch changes.

## Verify end-to-end
1. **Radio:** `curl -s $ADSB_JSON_URL | jq '.aircraft | length'` → non-zero on the Pi.
2. **Provider unit tests:** `pytest apps/ingestor/tests/test_adsb1090.py -q`.
3. **Loop:** run the ingestor with `FLIGHT_PROVIDER=adsb1090` against a test Supabase project;
   watch logs for `ADS-B snapshot received/emitted` and `Upserted flights`; confirm
   `flights_current` row count stays bounded.
4. **Read path / egress:** hit `/api/flights/snapshot` repeatedly; confirm `x-vercel-cache: HIT`
   between refreshes and that the Supabase dashboard egress meter rises only ~once per
   `SNAPSHOT_REFRESH_SECONDS`. Extrapolate against the 5 GB/mo budget.
