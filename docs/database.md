# Database Schema

## Supabase Structure

All data lives in a single Supabase Postgres database. The frontend connects with the anon key (read-only via RLS). The ingestor connects with the service role key (full access).

## Entity Relationship

```
airlines ──────┐
               ├──▶ flights_current ──▶ flights_history
aircraft ──────┘          │
                          ▼
airports            analytics_hourly
                    analytics_daily
```

## Tables

### flights_current

Live state of all active flights. **Realtime enabled** — the frontend subscribes to changes on this table via WebSocket.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| flight_iata | VARCHAR(10) | Flight number (e.g., AA100) |
| flight_icao | VARCHAR(10) | ICAO flight ID |
| airline_iata | VARCHAR(3) | Airline code → airlines.iata_code |
| airline_name | VARCHAR(255) | Airline display name |
| aircraft_icao | VARCHAR(10) | Aircraft type code |
| aircraft_registration | VARCHAR(20) | Tail number |
| direction | ENUM | 'arrival' or 'departure' |
| origin_iata / destination_iata | VARCHAR(3) | Route endpoints |
| scheduled_departure / arrival | TIMESTAMPTZ | Scheduled times |
| actual_departure / arrival | TIMESTAMPTZ | Actual times |
| estimated_arrival | TIMESTAMPTZ | Current ETA |
| status | ENUM | scheduled, en_route, landed, arrived, departed, cancelled, diverted, delayed, unknown |
| delay_minutes | INTEGER | Delay in minutes |
| latitude / longitude | DOUBLE | Current position |
| altitude_ft | INTEGER | Altitude in feet |
| heading | DOUBLE | Heading in degrees |
| ground_speed_knots | INTEGER | Ground speed |
| vertical_speed_fpm | INTEGER | Vertical speed |
| departure_terminal / gate | VARCHAR | Terminal and gate |
| arrival_terminal / gate | VARCHAR | Terminal and gate |
| baggage_belt | VARCHAR | Baggage carousel |
| data_source | VARCHAR(50) | Which provider supplied this data |
| updated_at | TIMESTAMPTZ | Auto-updated via trigger |

**Unique constraint**: `(flight_iata, scheduled_departure)` — used for upserts.

### flights_history

Same schema as `flights_current` plus `archived_at`. Rows are moved here after completion.

### airlines

Reference table with IATA/ICAO codes, name, logo URL, country. Seeded with 15 MIA carriers.

### aircraft

Reference table with ICAO type code, model, manufacturer, category.

### airports

Reference table. MIA is seeded by default.

### analytics_hourly / analytics_daily

Pre-computed aggregations for the dashboard. Each row contains:
- total_flights, on_time, delayed, cancelled, diverted
- avg_delay_minutes, max_delay_minutes
- (daily only) top_delayed_airline, busiest_hour

## Realtime

`flights_current` is added to the `supabase_realtime` publication. The frontend subscribes:

```typescript
supabase.channel("flights_current_changes")
  .on("postgres_changes", { event: "*", schema: "public", table: "flights_current" }, callback)
  .subscribe();
```

## Row Level Security

- All tables have RLS enabled
- Anonymous (anon key): SELECT only on all tables
- Service role (ingestor): Full CRUD (bypasses RLS by default)

## Indexes

Optimized for the frontend's primary query patterns:
- `flight_iata` — search by flight number
- `airline_iata` — filter by airline
- `status` — filter by status
- `direction` — arrivals vs departures
- `scheduled_arrival/departure` — sort by time
- `updated_at` — freshness queries

## Frontend Queries

The web app makes these primary queries:

1. **Map & Table**: `SELECT * FROM flights_current ORDER BY updated_at DESC`
2. **Analytics hourly**: `SELECT * FROM analytics_hourly ORDER BY hour DESC LIMIT 48`
3. **Analytics daily**: `SELECT * FROM analytics_daily ORDER BY date DESC LIMIT 30`

All subsequent updates come through the realtime subscription — no polling needed.

## Regenerating types after a migration

The web app's TypeScript types live in `apps/web/src/types/database.ts` and are the **source of
truth** consumed across the app. When you add or change a migration under
`supabase/migrations/`, keep the types in sync:

1. Bring up the local schema (applies all migrations):

   ```bash
   npx supabase start
   ```

2. Generate types from the local database into a build artifact (gitignored):

   ```bash
   npm run db:gen-types   # → apps/web/src/types/database.generated.ts
   ```

3. Reconcile the changes into `apps/web/src/types/database.ts` and commit it.

### Drift guard

`scripts/check-types-drift.sh` (wired into CI as the `db / types-drift` job and into
pre-commit) fails if a commit touches `supabase/migrations/**` **without** updating
`apps/web/src/types/database.ts`. It is a pure git-diff check — no database required — so it
runs cheaply everywhere. Run it manually with:

```bash
npm run db:check-types-drift
```

> The hand-maintained `database.ts` stays authoritative because no remote Supabase project is
> linked in this repo; `db:gen-types` is the helper for keeping it accurate, not a replacement.
