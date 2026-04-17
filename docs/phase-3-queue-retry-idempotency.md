# Phase 3 Slice B: Queue + Retry + Idempotency Design

- Related issue: #27
- Status: Proposed (implementation-ready)
- Date: 2026-04-11

## Goal

Make ingestion resilient to transient provider/API failures and safe under duplicate/replayed job execution.

## Scope

1. Define a deterministic queue contract for ingestion jobs.
2. Define bounded retry policy with dead-letter handoff.
3. Define idempotent write boundary for `flights_current`, `flights_history`, and alert side effects.
4. Define rollout/verification checklist for first production enablement.

## Queue Contract

### Job shape

```json
{
  "jobId": "uuid-v7",
  "provider": "aviationstack",
  "airportIata": "MIA",
  "windowStartUtc": "2026-04-11T07:00:00Z",
  "windowEndUtc": "2026-04-11T07:01:00Z",
  "attempt": 1,
  "maxAttempts": 5,
  "traceId": "ingest-mia-20260411T070000Z"
}
```

### Lease + visibility rules

- Visibility timeout: **120s**.
- Worker heartbeats/extends lease every **30s** while active.
- If worker dies, job becomes visible again after timeout.
- Max in-flight per worker: **1** initially (safe rollout), then tune upward.

## Retry Policy

Transient errors only (HTTP 429/5xx, network timeout):

- attempt 1 -> +15s
- attempt 2 -> +30s
- attempt 3 -> +60s
- attempt 4 -> +120s
- attempt 5 -> +300s then DLQ

Permanent errors (invalid schema, auth misconfig, unknown airport) skip retry and go directly to DLQ with reason code.

## Idempotency Strategy

### Record-level idempotency key

```
{provider}:{airport}:{flight_iata}:{observed_bucket_utc}
```

Where `observed_bucket_utc` is minute-bucketed UTC time (`YYYY-MM-DDTHH:MM:00Z`).

### Storage behavior

- `flights_current`: upsert on stable natural key (`provider`, `flight_iata`, `airport`, `direction`).
- `flights_history`: append only if `idempotency_key` not already present.
- Alerts/notifications: write `alert_dedupe_key` in DB before emit; emit only on insert success.

## Failure-Mode Policy

- Queue backlog > 10 minutes: raise warning alert.
- DLQ growth > 20 jobs/hour: raise high-severity alert.
- Duplicate-key conflicts are expected and counted as safe replays (not failures).

## Rollout Plan

1. Ship queue abstraction behind feature flag `INGEST_QUEUE_ENABLED=false`.
2. Add metrics:
   - `ingest_queue_depth`
   - `ingest_retry_count`
   - `ingest_dlq_count`
   - `ingest_idempotent_replay_count`
3. Enable on one airport/provider path for 24h.
4. Confirm DLQ/replay metrics and no alert duplication.
5. Expand gradually to full ingestion.

## Definition of Done Mapping (Issue #27)

- ✅ Queue contract documented with lease/visibility semantics
- ✅ Retry policy bounded and deterministic
- ✅ Idempotency boundary defined for writes + side effects
- ✅ Rollout + observability checklist provided
