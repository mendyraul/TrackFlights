# Architecture

## System Overview

MIA Flight Tracker is a three-tier system designed for zero-cost deployment.

### Data Flow

```
External Flight APIs
        │
        ▼
┌───────────────────┐
│  Python Ingestor  │  (Raspberry Pi)
│                   │
│  • Polls APIs     │
│  • Normalizes     │
│  • Computes diffs │
│  • Upserts to DB  │
└───────┬───────────┘
        │ HTTPS (Supabase client)
        ▼
┌───────────────────┐
│  Supabase         │
│                   │
│  • Postgres DB    │
│  • Realtime       │
│  • Row Level Sec  │
│  • Edge Functions │
└───────┬───────────┘
        │ WebSocket (Realtime)
        ▼
┌───────────────────┐
│  Next.js Frontend │  (Vercel)
│                   │
│  • Map view       │
│  • Table view     │
│  • Analytics      │
└───────────────────┘
```

## Component Details

### Frontend (apps/web)

- **Framework**: Next.js 14+ with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Map**: Leaflet or Mapbox GL JS (free tier)
- **Charts**: Recharts
- **State**: React hooks + Supabase Realtime subscriptions
- **Deployment**: Vercel (free tier, auto-deploy from GitHub)

**Key pages:**
- `/` — Map view (default)
- `/table` — Arrival/departure board
- `/analytics` — Operational dashboards

### Ingestion Service (apps/ingestor)

- **Language**: Python 3.11+
- **Runtime**: Raspberry Pi (systemd service) or Docker
- **Scheduling**: Simple polling loop with configurable interval
- **Database client**: supabase-py

**Responsibilities:**
1. Poll flight data APIs every N seconds
2. Normalize API responses into canonical schema
3. Diff against current state to detect changes
4. Upsert changed flights into `flights_current`
5. Archive completed flights to `flights_history`
6. Compute hourly/daily analytics rollups

### Database (Supabase)

- **Engine**: PostgreSQL 15
- **Realtime**: Enabled on `flights_current` for live UI updates
- **Security**: Row Level Security (RLS) with anonymous read access
- **Extensions**: pg_cron (analytics rollups), postgis (optional, geo queries)

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Frontend framework | Next.js | SSR, free Vercel hosting, React ecosystem |
| Database | Supabase Postgres | Free tier, built-in Realtime, typed client |
| Ingestion runtime | Raspberry Pi | Zero-cost, always-on, low power |
| Realtime mechanism | Supabase Realtime | No WebSocket server needed, built into Supabase |
| Monorepo | npm workspaces | Simple, no extra tooling |
| No Redis | Supabase only | Reduce complexity; add caching later if needed |

## Scaling Path

1. **Phase 1** (current): Single Raspberry Pi ingestor, Supabase free tier
2. **Phase 2**: Add Redis for caching, multiple API sources
3. **Phase 3**: ML models for delay prediction, anomaly detection
4. **Phase 4**: Multi-airport support, paid Supabase tier
