# Performance Baseline (Phase 4 Slice G)

Goal: capture repeatable baseline metrics before scale work so regressions are visible.

## Scope

- Web performance baseline (Lighthouse: home + map route)
- API health latency baseline (`/api/health`)
- API load smoke baseline (k6 short run)
- Ingestor cycle latency baseline (single poll run)

## Baseline capture protocol

### 1) Web Lighthouse baseline

Run against Vercel preview or production candidate:

```bash
npx lighthouse https://<preview-or-prod-url> --quiet --chrome-flags="--headless" --output=json --output-path=./docs/evidence/perf/lighthouse-home.json
npx lighthouse https://<preview-or-prod-url>/map --quiet --chrome-flags="--headless" --output=json --output-path=./docs/evidence/perf/lighthouse-map.json
```

Target thresholds (initial gate):

- Performance score >= 70
- Accessibility score >= 90
- Best Practices score >= 90
- SEO score >= 85

### 2) API health latency baseline

```bash
for i in {1..20}; do curl -s -o /dev/null -w "%{time_total}\n" https://<preview-or-prod-url>/api/health; done > ./docs/evidence/perf/api-health-latency-seconds.txt
```

Record p50/p95 in PR notes.

### 3) API load smoke baseline (k6)

```bash
k6 run -e BASE_URL=https://<preview-or-prod-url> scripts/k6/health-smoke.js
```

Starter acceptance target:
- p95 < 800ms on `/api/health`
- error rate < 1%

### 4) Ingestor cycle latency baseline

```bash
python -m apps.ingestor.src.main --once --provider example --airport MIA --log-json | tee ./docs/evidence/perf/ingestor-once.log
```

Extract:
- cycle start timestamp
- cycle end timestamp
- records ingested

## Evidence files

Store evidence under:

- `docs/evidence/perf/<date>-lighthouse-home.json`
- `docs/evidence/perf/<date>-lighthouse-map.json`
- `docs/evidence/perf/<date>-api-health-latency-seconds.txt`
- `docs/evidence/perf/<date>-ingestor-once.log`

## Phase 4 release gate addition

Before closing Issue #2:

- [ ] Performance baseline captured (web + api + ingestor)
- [ ] p50/p95 latency values posted in issue comment
- [ ] Any out-of-threshold metric has a follow-up issue linked

Owner: Rico  
Status: Baseline protocol committed; evidence capture pending runtime URL + env
