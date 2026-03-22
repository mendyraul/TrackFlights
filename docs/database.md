# Database Schema

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
Live state of all active flights (in-air, scheduled, taxiing).
- Primary key: `id` (UUID)
- Unique constraint: `flight_iata + scheduled_departure`
- Realtime enabled for frontend subscriptions
- Rows are moved to `flights_history` once completed/cancelled

### flights_history
Archived flights for analytics and historical queries.
- Same schema as `flights_current` plus `archived_at`
- Partitioned by month (future optimization)

### airlines
Reference table for airline metadata.
- IATA code, ICAO code, name, logo URL

### aircraft
Reference table for aircraft types.
- ICAO type code, model name, manufacturer, category

### airports
Reference table (primarily MIA, but includes origin/destination airports).
- IATA, ICAO, name, lat, lng, timezone

### analytics_hourly
Pre-computed hourly metrics for dashboard performance.
- on_time_arrivals, delayed_arrivals, cancelled, diverted, avg_delay_minutes

### analytics_daily
Daily rollups of analytics_hourly.

## Indexes

- `flights_current(flight_iata)` — search by flight number
- `flights_current(airline_iata)` — filter by airline
- `flights_current(status)` — filter by status
- `flights_current(scheduled_arrival)` — sort by arrival time
- `flights_history(archived_at)` — time-range queries

## Row Level Security

- Anonymous users: SELECT on all tables (read-only public dashboard)
- Service role (ingestor): Full CRUD on all tables
