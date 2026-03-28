# Performance SLO Baseline (Phase 4 / Issue #2 Slice 3)

This document defines a first-pass performance baseline with measurable targets and simple commands that can run from a developer workstation.

## Scope
- Web API health latency (`apps/web`)
- Ingestor cycle timing + queue lag (`apps/ingestor`)
- Alert thresholds + owner routing

## 1) Web API Health Latency Budget

Endpoint:
- `GET /api/health`

Targets (baseline):
- p50 <= 120ms
- p95 <= 300ms
- p99 <= 500ms
- Error rate <= 1% over rolling 5m window

Quick measurement command (local/staging):

```bash
URL="http://localhost:3000/api/health"
for i in {1..30}; do
  curl -s -o /dev/null -w "%{time_total}\n" "$URL"
done | awk '
{a[NR]=$1; s+=$1}
END{
  n=NR;
  asort(a);
  p50=a[int((50*n+99)/100)];
  p95=a[int((95*n+99)/100)];
  p99=a[int((99*n+99)/100)];
  printf("samples=%d avg=%.3fs p50=%.3fs p95=%.3fs p99=%.3fs\n", n, s/n, p50, p95, p99);
}'
```

Evidence path:
- Save output snapshot per release candidate in `docs/evidence/performance/`.

## 2) Ingestor Cycle Timing + Queue Lag Target

Definitions:
- **Cycle time**: one full ingest iteration (fetch -> parse -> write).
- **Queue lag**: age of oldest pending work item not yet processed.

Targets (baseline):
- Ingestor cycle p95 <= 90s
- Queue lag p95 <= 10m
- Queue lag hard-alert if > 20m sustained for >= 10m

Measurement commands:

```bash
# Run one health snapshot (added in Phase 2)
python -m src.utils.health_snapshot
```

```bash
# Optional: capture timestamped snapshots every 60s for 10 minutes
for i in {1..10}; do
  date -u +"%Y-%m-%dT%H:%M:%SZ"
  python -m src.utils.health_snapshot
  sleep 60
done | tee docs/evidence/performance/ingestor-snapshot-$(date -u +%Y%m%dT%H%M%SZ).log
```

Evidence path:
- `docs/evidence/performance/ingestor-snapshot-<timestamp>.log`

## 3) Alert Thresholds + Owner

Baseline alert rules:
- **P1 (page):** web health endpoint unavailable for >= 5m OR queue lag > 20m for >= 10m
- **P2 (ticket):** web p95 latency > 300ms for >= 15m OR ingestor cycle p95 > 90s for >= 15m
- **P3 (backlog):** recurring p50 drift > 20% week-over-week

Owner routing:
- Primary owner: Rico (platform/orchestration)
- Repo owner escalation: Raul

Evidence requirements per release candidate:
- 1 web latency sample output (>= 30 requests)
- 1 ingestor health snapshot batch
- Any triggered alerts and disposition notes

## 4) Initial Review Cadence

- Weekly baseline review until production launch
- After launch: bi-weekly review, then monthly once stable for 6 weeks

## 5) Notes

These are intentionally conservative starter targets. Tighten budgets after collecting at least 2 weeks of real production telemetry.
