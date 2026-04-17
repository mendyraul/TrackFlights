# Performance/load baseline (Phase 4 Slice B)

Goal: make baseline capture repeatable so latency regressions are visible before release.

## Scope

- API health latency baseline (`/api/health`)
- Optional web Lighthouse snapshots for home/map routes

## Commands (runnable)

### 1) Capture API health latency samples

```bash
npm run perf:latency:capture -- https://<preview-or-prod-url>/api/health 50 docs/evidence/perf/api-health-latency-seconds.txt
```

This writes raw per-request seconds and prints JSON percentiles.

### 2) Recompute summary from an existing sample file

```bash
npm run perf:latency:summary -- docs/evidence/perf/api-health-latency-seconds.txt
```

### 3) Optional Lighthouse snapshots

```bash
npx lighthouse https://<preview-or-prod-url> --quiet --chrome-flags="--headless" --output=json --output-path=docs/evidence/perf/lighthouse-home.json
npx lighthouse https://<preview-or-prod-url>/map --quiet --chrome-flags="--headless" --output=json --output-path=docs/evidence/perf/lighthouse-map.json
```

## Baseline evidence contract

Save artifacts under `docs/evidence/perf/`:

- `api-health-latency-seconds.txt`
- `api-health-summary.json` (or issue comment paste)
- optional `lighthouse-home.json`
- optional `lighthouse-map.json`

Example summary payload:

```json
{
  "samples": 50,
  "minMs": 82.11,
  "p50Ms": 103.74,
  "p95Ms": 189.22,
  "p99Ms": 214.65,
  "maxMs": 241.13,
  "avgMs": 117.4
}
```

## Release gate

Before closing #20, post one issue comment with:

- target URL/environment tested
- sample count
- p50/p95/p99 values
- follow-up issue if p95 > 300ms or p99 > 500ms
