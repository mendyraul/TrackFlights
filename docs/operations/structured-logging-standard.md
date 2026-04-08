# Structured Logging Standard (Web + Ingestor)

Owner: Rico (`subagent:Doc`)  
Issue: #39 (Phase 2 / Slice B)

## 1) Goals

- Keep logs queryable across web (Next.js) and ingestor (Python).
- Support fast incident triage with correlation IDs and consistent event names.
- Prevent sensitive-data leaks by default.

## 2) Required JSON fields

Every log line must be JSON with these fields:

- `ts` (ISO-8601 UTC timestamp)
- `level` (`debug` | `info` | `warn` | `error`)
- `service` (`web` | `ingestor`)
- `env` (`dev` | `preview` | `prod`)
- `event` (stable snake_case event name)
- `message` (human-readable summary)
- `request_id` (HTTP/request lifecycle correlation)
- `trace_id` (cross-service correlation if available)
- `op` (short operation name, e.g. `poll_adsb`, `upsert_flight`)

Recommended when present:

- `duration_ms`
- `flight_iata`
- `icao24`
- `status_code`
- `retry_count`
- `queue_depth`

## 3) Severity taxonomy

- `debug`: local troubleshooting only; avoid in prod unless temporarily enabled.
- `info`: normal state transitions and successful operations.
- `warn`: recoverable anomaly (fallback path, transient external failure).
- `error`: failed operation needing action/alert correlation.

## 4) Event naming rules

- Use `domain.action.result` (snake_case segments), e.g.:
  - `ingestor.poll.started`
  - `ingestor.upsert.success`
  - `web.api.health.ready`
  - `web.map.render.failed`
- Keep names stable; do not encode variable values in `event`.

## 5) PII + secrets policy

Never log:

- auth tokens, API keys, cookies, JWT bodies
- full email/phone/user identifiers
- raw request bodies from external clients

If needed for debugging, log only redacted forms:

- IDs: keep last 4 chars max
- IPs: mask final octet
- payloads: allowlist explicit safe fields only

## 6) Web examples (Next.js)

```json
{"ts":"2026-04-08T22:30:00.000Z","level":"info","service":"web","env":"prod","event":"web.api.health.ready","message":"Readiness probe passed","request_id":"req_7d2c","trace_id":"trc_91af","op":"health_ready","duration_ms":3,"status_code":200}
```

```json
{"ts":"2026-04-08T22:31:10.000Z","level":"error","service":"web","env":"prod","event":"web.flight.fetch.failed","message":"Flight query failed","request_id":"req_a93d","trace_id":"trc_91af","op":"fetch_flights","duration_ms":850,"status_code":500}
```

## 7) Ingestor examples (Python)

```json
{"ts":"2026-04-08T22:32:10.000Z","level":"info","service":"ingestor","env":"prod","event":"ingestor.poll.completed","message":"ADS-B poll cycle complete","request_id":"poll_20260408_2232","trace_id":"trc_ing_12","op":"poll_adsb","duration_ms":4120,"queue_depth":0}
```

```json
{"ts":"2026-04-08T22:32:15.000Z","level":"warn","service":"ingestor","env":"prod","event":"ingestor.upsert.retry","message":"Upsert transient failure; retrying","request_id":"poll_20260408_2232","trace_id":"trc_ing_12","op":"upsert_flight","retry_count":1,"flight_iata":"AA123","icao24":"a1b2c3"}
```

## 8) Rollout checklist (32k-safe implementation slices)

1. **B2.1 Web logger wrapper**
   - Add one helper that injects required fields.
   - Migrate health and flight endpoints first.
2. **B2.2 Ingestor logger adapter**
   - Add formatter enforcing field contract.
   - Migrate poll start/end + upsert paths.
3. **B2.3 Correlation propagation**
   - Thread `request_id`/`trace_id` through API → ingest trigger path.
4. **B2.4 Validation gate**
   - Add lightweight lint/test assertion for required keys on sample log fixtures.
5. **B2.5 Evidence capture**
   - Save 10-line prod-safe log sample under `docs/evidence/` per service.

## 9) Acceptance criteria for Slice B

- Standard documented in-repo with required schema and redaction policy.
- Web + ingestor examples included and copy/paste ready.
- Rollout split into micro-slices executable by local lane without context overflow.
