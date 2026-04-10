# Structured Logging Standard (Web + Ingestor)

## Required schema

Every log event should include:

- `timestamp` (ISO-8601 UTC)
- `severity` (`debug` | `info` | `warn` | `error`)
- `component` (`web` | `ingestor` | `worker`)
- `event` (stable, snake_case identifier)
- `requestId` or `traceId` (when applicable)
- `context` (object with bounded metadata)

## Redaction rules

Never log:

- Secrets/tokens/API keys
- Session cookies or auth headers
- Raw PII (email, full name, phone)

If user identifiers are required for triage, log hashed or truncated forms.

## Level policy

- `debug`: local troubleshooting only; keep off in prod by default
- `info`: lifecycle + expected business flow milestones
- `warn`: recoverable failures, retries, degraded dependency states
- `error`: request/job failure requiring action

## Web example (Next.js route)

```ts
console.info(JSON.stringify({
  timestamp: new Date().toISOString(),
  severity: 'info',
  component: 'web',
  event: 'flights.fetch.success',
  requestId,
  context: { count: flights.length }
}));
```

## Ingestor example

```py
logger.info(
    "ingestor.poll.complete",
    extra={
        "severity": "info",
        "component": "ingestor",
        "event": "ingestor.poll.complete",
        "context": {"fetched": fetched_count, "stored": stored_count},
    },
)
```

## Troubleshooting quick queries

- Vercel logs: filter by `event:` and `severity:error`
- Ingestor journal: grep `event=` for correlation by `requestId` or job window
