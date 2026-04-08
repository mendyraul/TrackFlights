# Health Check Contract

## Purpose
This document defines the minimum health checks required for TrackFlights to quickly detect and triage incidents across the web app, ingestion pipeline, and Supabase dependencies.

## Severity Mapping
- **P1 (critical):** customer-facing outage, ingestion halted, or data corruption risk.
- **P2 (high):** partial outage, sustained elevated errors, delayed ingestion >15 minutes.
- **P3 (medium):** degraded performance, intermittent failures, delayed ingestion >5 minutes.
- **P4 (low):** non-blocking warning, expected transient errors.

## Required Checks

## 1) Web (Next.js on Vercel)
- `GET /api/health` returns 200 with status/service/timestamp/version.
- Response latency target: p95 < 500ms.
- Route-handler error rate < 1% over rolling 5m.
- Latest production deployment status is READY.
- Essential env vars present (do not log values).

Alert triggers:
- P1: health endpoint down for 3 consecutive checks.
- P2: error rate > 5% for 10m.
- P3: p95 latency > 1500ms for 10m.

## 2) Ingestor Worker
- Worker heartbeat updates every <= 60s.
- Last successful ingestion <= 5m old during active windows.
- Queue depth below threshold over rolling 10m.
- Retry/error ratio bounded; no retry storm.

Alert triggers:
- P1: no heartbeat for > 3m.
- P2: no successful ingest for > 15m.
- P2: queue depth > threshold for > 10m.
- P3: retry ratio > 20% for > 15m.

## 3) Supabase Dependencies
- DB connectivity from web and ingestor succeeds.
- PostgREST/auth/realtime endpoints reachable.
- Core read + write/read probe succeeds.

Alert triggers:
- P1: DB unavailable.
- P2: PostgREST/realtime unavailable > 5m.
- P2: write probe fails for > 5m.

## Evidence Checklist
- Timestamped check snapshots.
- Request/trace IDs.
- Last known good deployment SHA.
- Queue depth and ingestion lag at incident start.
- Supabase reachability proof.

## Redaction Rule
Never log secrets, access tokens, cookies, or PII.
