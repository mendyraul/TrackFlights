# MIA Flight Tracker

Real-time flight tracking system for Miami International Airport (MIA). Displays live aircraft positions on a map, airport-style arrival/departure boards, and operational analytics dashboards.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Flight APIs │────▶│  Ingestor    │────▶│  Supabase       │
│  (External)  │     │  (Raspberry  │     │  (Postgres +    │
│              │     │   Pi/Python) │     │   Realtime)     │
└─────────────┘     └──────────────┘     └────────┬────────┘
                                                   │
                                          Realtime │ Subscriptions
                                                   │
                                          ┌────────▼────────┐
                                          │  Next.js Web    │
                                          │  (Vercel)       │
                                          └─────────────────┘
```

- **Frontend**: Next.js + TypeScript on Vercel (free tier)
- **Database**: Supabase Postgres with Realtime subscriptions (free tier)
- **Ingestion**: Python worker on Raspberry Pi polling flight APIs
- **Cost**: $0/month infrastructure

## Monorepo Structure

```
apps/
  web/              → Next.js frontend
  ingestor/         → Python ingestion worker
supabase/
  migrations/       → Database schema migrations
infra/
  docker/           → Dockerfiles
  compose/          → Docker Compose for local dev
  systemd/          → Service files for Raspberry Pi
packages/
  shared-types/     → TypeScript type definitions
docs/               → Architecture & development docs
```

## Features

| Feature | Status |
|---------|--------|
| Live Map with aircraft icons | Planned |
| Arrival/Departure board | Planned |
| Analytics dashboard | Planned |
| Real-time updates | Planned |
| Weather delay prediction (ML) | Future |
| Anomaly detection (ML) | Future |

## Quick Start

### Prerequisites
- Node.js >= 18
- Python >= 3.11
- Docker & Docker Compose
- Supabase CLI (`npx supabase`)

### Local Development

```bash
# Clone
git clone git@github.com:mendyraul/TrackFlights.git
cd TrackFlights

# Start local Supabase + services
docker compose -f infra/compose/docker-compose.yml up -d

# Frontend
cd apps/web
npm install
npm run dev

# Ingestor
cd apps/ingestor
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m src.main
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

## Deployment

- **Frontend**: Push to `main` → auto-deploys to Vercel
- **Ingestor**: Runs as a systemd service on Raspberry Pi
- **Database**: Managed by Supabase (cloud)

See [docs/deployment.md](docs/deployment.md) for detailed instructions.

Production readiness baseline (CI/CD, branch protection, env strategy):
- [docs/production-baseline.md](docs/production-baseline.md)
- [docs/observability-reliability-runbook.md](docs/observability-reliability-runbook.md)

## License

MIT
