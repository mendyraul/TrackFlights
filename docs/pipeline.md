# Ingestion Pipeline

## Overview

The ingestion service is a Python worker that continuously polls external flight APIs, normalizes the data, and writes it to Supabase. It runs on a Raspberry Pi (or Docker) as a long-lived process.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Poller (worker/poller.py)                          │
│                                                     │
│  Every N seconds:                                   │
│                                                     │
│  1. Provider.fetch_arrivals("MIA")                  │
│  2. Provider.fetch_departures("MIA")                │
│     │                                               │
│     ▼                                               │
│  3. flight_normalizer.normalize_batch()             │
│     Provider.normalize() per flight                 │
│     │                                               │
│     ▼                                               │
│  4. supabase_client.get_current_flights()           │
│     │                                               │
│     ▼                                               │
│  5. flight_diff_engine.compute_diff()               │
│     Compare incoming vs DB → new/updated/unchanged  │
│     │                                               │
│     ▼                                               │
│  6. supabase_client.upsert_flights(new + updated)   │
│     │                                               │
│     ▼                                               │
│  7. supabase_client.archive_completed_flights()     │
│     Move landed/cancelled flights → flights_history │
│     │                                               │
│     ▼                                               │
│  8. Log statistics                                  │
└─────────────────────────────────────────────────────┘
```

## Provider Abstraction

All flight data sources implement `BaseFlightProvider`:

```python
class BaseFlightProvider(ABC):
    async def fetch_arrivals(airport_iata) -> list[dict]
    async def fetch_departures(airport_iata) -> list[dict]
    def normalize(raw, direction) -> dict
    @property
    def name() -> str
```

### Available Providers

| Provider | Module | API Key Required | Notes |
|----------|--------|-----------------|-------|
| AviationStack | `aviationstack_provider.py` | Yes | Production provider |
| AeroAPI (planning scaffold) | config + `aeroapi_guardrails.py` | Yes | South Florida bbox/cost sizing scaffold for issue `#77` before wiring a live provider |
| Example | `example_provider.py` | No | Generates mock data for development |

Set `FLIGHT_PROVIDER=example` in `.env` to use mock data without an API key.

## Diff Engine

The diff engine compares incoming normalized flights against current DB state to minimize writes:

**Tracked fields** (changes to these trigger an upsert):
- `status`, `delay_minutes`
- `latitude`, `longitude`, `altitude_ft`, `heading`, `ground_speed_knots`
- `actual_departure`, `actual_arrival`, `estimated_arrival`
- `arrival_gate`, `departure_gate`, `baggage_belt`
- `arrival_terminal`, `departure_terminal`

Flights with no changes to tracked fields are skipped.

## History Archival

Completed flights (landed, arrived, departed, cancelled) are archived to `flights_history` after 2 hours. This keeps `flights_current` small and fast for realtime queries.

## Logging

Each cycle logs:
- Fetched counts (arrivals/departures)
- Normalized count
- Diff results (new/updated/unchanged)
- Upserted count
- Archived count
- Current DB status breakdown

Use `journalctl -u mia-ingestor -f` on the Raspberry Pi to monitor.

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FLIGHT_PROVIDER` | `aviationstack` | Provider to use |
| `FLIGHT_API_KEY` | (required for aviationstack) | API key |
| `FLIGHT_API_BASE_URL` | `https://api.aviationstack.com/v1` | API base URL |
| `POLL_INTERVAL_SECONDS` | `60` | Seconds between poll cycles |
| `AEROAPI_BBOX` | `25.2,-82.0,27.0,-80.0` | South Florida search box (`min_lat,min_lon,max_lat,max_lon`) |
| `AEROAPI_SEARCH_LIMIT` | `15` | Planned per-page cap; matches AeroAPI Standard page-size ceiling |
| `AEROAPI_MAX_PAGES_PER_POLL` | `4` | Safety cap for a single poll cycle when region results span multiple pages |
| `AEROAPI_SNAPSHOT_SIZE_KIB` | `35` | Used for monthly Supabase egress estimation |
| `AEROAPI_SNAPSHOT_REFRESH_SECONDS` | `60` | Planned server-side snapshot cadence for cached reads |
| `SUPABASE_URL` | (required) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | (required) | Service role key (bypasses RLS) |

## AeroAPI planning guardrails

Issue `#77` needs two budgets protected before the live FlightAware provider is enabled:

- **AeroAPI request volume:** the ingestor now computes estimated monthly requests/result rows from
  `POLL_INTERVAL_SECONDS`, `AEROAPI_MAX_PAGES_PER_POLL`, and `AEROAPI_SEARCH_LIMIT`.
- **Supabase egress:** the same runtime summary estimates uncached monthly snapshot egress from
  `AEROAPI_SNAPSHOT_SIZE_KIB` and `AEROAPI_SNAPSHOT_REFRESH_SECONDS` so the public map can stay
  inside the free-tier read budget.

This scaffold is intentionally planning-only for now: it validates the bbox/env contract and emits
cost-safe startup numbers before a live AeroAPI fetcher is wired into the ingestor loop.
