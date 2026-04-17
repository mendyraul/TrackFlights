# Structured Logging Standard (Issue #39)

## Purpose
TrackFlights logs must be machine-parseable and consistent across:
- Next.js web/API handlers (`apps/web`)
- Ingestor worker (`apps/ingestor`)

This enables fast incident triage, reliable alerting, and low-noise debugging.

## Required Log Schema
Every operational log event should include:

- `timestamp` (ISO-8601 UTC)
- `severity` (`debug` | `info` | `warn` | `error`)
- `service` (`web` | `ingestor`)
- `component` (route/module/job name)
- `event` (stable event key; snake_case)
- `message` (short human-readable summary)
- `trace_id` (request/cycle correlation id)
- `context` (structured object with event-specific fields)

Recommended optional fields:
- `env` (`development` | `preview` | `production`)
- `duration_ms` for timed operations
- `provider` (e.g., `aviationstack`, `openmeteo`, `supabase`)
- `flight_iata` for flight-scoped events
- `cycle` for poller iterations

## Severity Policy
- `debug`: local troubleshooting only; disabled in production by default.
- `info`: expected lifecycle events (poll start/complete, health checks, successful writes).
- `warn`: degraded but recoverable states (partial provider failure, retry path).
- `error`: failed operation requiring intervention or alert review.

## Redaction + PII Rules (Mandatory)
Never log:
- secrets/tokens/keys (`*_KEY`, `*_TOKEN`, `Authorization`, cookies)
- full request headers
- raw user-identifying payloads

Allowed patterns:
- log key names, not values (`"supabase_key_present": true`)
- mask tokens if needed (`abcd...wxyz`)
- include counts/sizes instead of payload content (`records=42`)

If unsure, treat the field as sensitive and redact.

## Event Naming Convention
Use stable `event` names for alerts and dashboards:

- `api_health_check`
- `api_request_complete`
- `ingestor_cycle_started`
- `ingestor_cycle_completed`
- `ingestor_write_failed`
- `provider_fetch_failed`

Keep event names stable; avoid freeform ad-hoc labels.

## Implementation Example — Next.js Route Handler
```ts
// apps/web/src/lib/logger.ts (example shape)
export function logEvent(entry: {
  severity: 'info' | 'warn' | 'error'
  component: string
  event: string
  message: string
  trace_id: string
  context?: Record<string, unknown>
}) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'web',
      ...entry,
    })
  )
}

// usage in a route handler
logEvent({
  severity: 'info',
  component: 'api/health',
  event: 'api_health_check',
  message: 'health endpoint served',
  trace_id,
  context: { status: 'ok' },
})
```

## Implementation Example — Ingestor Job (Python/structlog)
```py
logger.info(
  "ingestor cycle complete",
  service="ingestor",
  component="worker.poller",
  event="ingestor_cycle_completed",
  trace_id=trace_id,
  cycle=cycle,
  duration_ms=duration_ms,
  provider="aviationstack",
  records=records,
)

logger.error(
  "supabase write failed",
  service="ingestor",
  component="services.supabase_client",
  event="ingestor_write_failed",
  trace_id=trace_id,
  error_type=type(exc).__name__,
  # do not log key/token values
)
```

## Troubleshooting Queries / Checklist

### Local (dev)
- Filter by event:
  - `rg '"event":"ingestor_write_failed"' logs/*.jsonl`
- Correlate a single cycle:
  - `rg '"trace_id":"<id>"' logs/*.jsonl`

### Vercel Logs
- Filter by `event` + `severity` first.
- Confirm `trace_id` appears across request start/finish logs.
- Escalate if repeated `error` for same event exceeds 3 occurrences in 10 minutes.

### Incident Triage Fast Path
1. Find first `error` event and capture `trace_id`.
2. Pull all logs sharing that `trace_id`.
3. Identify failing component (`web` vs `ingestor` vs provider path).
4. Attach snippet + timestamp + event key to incident note.

## Adoption Checklist
- [x] Common schema documented
- [x] Severity and redaction rules documented
- [x] Web + ingestor examples included
- [x] Troubleshooting query checklist included
