# Realtime Data Flow

## End-to-End Pipeline

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Flight API  │────▶│  Pi Ingestor     │────▶│  Supabase        │────▶│  Next.js Web    │
│  (External)  │     │  (Python worker) │     │  (Postgres +     │     │  (Browser)      │
│              │     │                  │     │   Realtime)      │     │                 │
│  AviationStack     │  Poll every 60s  │     │  Stores rows,    │     │  Subscribes to  │
│  or mock data│     │  Normalize       │     │  broadcasts      │     │  changes via    │
│              │     │  Diff            │     │  changes on      │     │  WebSocket      │
│              │     │  Upsert changed  │     │  flights_current │     │                 │
└─────────────┘     └──────────────────┘     └──────────────────┘     └─────────────────┘
```

## Step-by-Step Flow

### 1. Flight API → Pi Worker

The Python ingestor polls the flight API every `POLL_INTERVAL_SECONDS` (default: 60).

```
Provider.fetch_arrivals("MIA")  →  raw JSON
Provider.fetch_departures("MIA")  →  raw JSON
```

Each provider normalizes its response into the canonical schema via `provider.normalize()`.

### 2. Pi Worker → Supabase

The diff engine compares incoming flights against current DB state:

```
compute_diff(incoming, current_db)
  → new: flights not in DB yet
  → updated: flights with changed tracked fields
  → unchanged: skipped (no write)
  → removed: in DB but not in API (marked stale)
```

**Only changed rows are written.** This minimizes database writes and, crucially, minimizes the number of Realtime events broadcast to connected clients.

Tracked fields that trigger an update:
- `status`, `delay_minutes`
- `latitude`, `longitude`, `altitude_ft`, `heading`, `ground_speed_knots`, `vertical_speed_fpm`
- `actual_departure`, `actual_arrival`, `estimated_arrival`
- `arrival_gate`, `departure_gate`, `baggage_belt`
- `arrival_terminal`, `departure_terminal`

### 3. Supabase → Realtime Broadcast

When the ingestor upserts rows into `flights_current`, Supabase Postgres fires:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE flights_current;
```

This causes Supabase Realtime to broadcast a `postgres_changes` event over WebSocket to all subscribed clients.

Event types:
- `INSERT` — new flight appeared
- `UPDATE` — flight data changed
- `DELETE` — flight was archived/removed

### 4. Realtime → Frontend

The frontend subscribes via `FlightRealtimeService`:

```typescript
supabase
  .channel("flights_realtime")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "flights_current"
  }, callback)
  .subscribe();
```

**Key features of the subscription service:**

| Feature | Implementation |
|---------|---------------|
| Reconnection | Exponential backoff (1s → 2s → 4s → ... → 30s max) |
| Batching | Events are batched every 200ms to prevent UI thrashing |
| Deduplication | Multiple events for same flight ID → keep latest only |
| Status tracking | `connected` / `connecting` / `disconnected` states |
| Change highlights | Recently changed flight IDs tracked for 2s animation |

### 5. Frontend Update Cycle

```
Realtime event received
    ↓
Buffered in batch (200ms window)
    ↓
Deduplicated by flight ID
    ↓
React state updated (setFlights)
    ↓
Map markers animate to new position (1s ease-out)
Table rows highlight briefly (2s glow)
Dashboard KPIs recalculate
```

## Connection Status

The UI displays a connection badge on each page:

| Status | Indicator | Meaning |
|--------|-----------|---------|
| Connected | Green dot (pulsing) + "Live" | WebSocket active, receiving updates |
| Connecting | Yellow dot (pulsing) + "Reconnecting..." | Attempting to reconnect |
| Disconnected | Red dot (static) + "Disconnected" | No connection; will retry |

## Map Realtime Behavior

- **Position changes**: Markers animate smoothly from old to new coordinates (1s cubic ease-out)
- **Heading changes**: Aircraft icon rotates via CSS `transform: rotate()`
- **New flights**: Appear instantly on next batch flush
- **Removed flights**: Disappear on DELETE event
- **Changed flights**: Icon briefly turns orange (2s) to indicate an update
- **Clustering**: At zoom levels < 10, nearby aircraft cluster with count badges

## Table Realtime Behavior

- **Row updates**: Entire row gets a subtle glow highlight (2s fade)
- **Status changes**: Badge updates with new color coding
- **New flights**: Inserted into sorted position
- **Auto-sort**: Maintains current sort order as data changes

## Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| Burst of updates | 200ms batching + dedup |
| Map re-renders | `React.memo` on FlightMap, individual marker refs |
| Large flight count | Marker clustering reduces DOM nodes |
| Reconnect storms | Exponential backoff with 30s cap |
| Stale data | `updated_at` timestamps shown in sidebar |

## Configuration

### Ingestor
```env
POLL_INTERVAL_SECONDS=60    # How often to poll the flight API
FLIGHT_PROVIDER=example     # Use "example" for mock data
```

### Supabase
- Realtime must be enabled on `flights_current` table
- Publication: `supabase_realtime`
- Max concurrent connections: ~200 on free tier

### Frontend
- Batch interval: 200ms (hardcoded in `services/realtime.ts`)
- Highlight duration: 2s (hardcoded in `hooks/useFlights.ts`)
- Marker animation: 1s ease-out (hardcoded in `FlightMap.tsx`)

## Throughput Baseline + Limits

For scale-planning thresholds, measurement protocol, and evidence format, see:
- `docs/realtime-throughput-baseline.md`
- `docs/evidence/realtime-throughput-template.md`
- `docs/evidence/realtime/README.md`
