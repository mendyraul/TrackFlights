# Ingestion health and recovery

The recovery change extracts the existing `ml-models` freshness UI without
deploying its model-training work. It separates three observations:

| Probe | Meaning |
| --- | --- |
| `/api/healthz/live` | The application responds. |
| `/api/healthz/ready` | Required configuration exists and a bounded database read succeeds. |
| `/api/healthz/data` | Aircraft observations are recent, or a fresh receiver heartbeat confirms polling with no aircraft in range. |

Data becomes delayed after two minutes and unhealthy after 15 minutes. Health
responses are never cached. The response-generation timestamp is not the age
of the observations. A polling receiver with zero aircraft does not prove a
hardware fault; investigate prolonged silence separately.

## Rollout

1. Preserve the deployed Git SHA and current ingestor/service configuration.
2. Apply the additive receiver-heartbeat migration after existing migrations.
   It is compatible with the unpublished `ml-models` heartbeat table. Its
   public role has SELECT only; writes require the ingestor's service role.
3. Deploy the updated ingestor. Heartbeat writes occur only after successful
   ingestion and fail independently so a missing migration does not halt the
   existing pipeline. No AeroAPI polling interval or spending limit changes.
4. Deploy the web change. Without a heartbeat table it falls back to actual
   flight timestamps. An empty table remains ready but reports unhealthy data
   until observations or a receiver heartbeat arrive.
5. Run `python scripts/check-ingestion-health.py https://your-deployment`.
   Confirm observations and heartbeat advance over repeated polls, then
   observe 30–60 minutes of continued operation. Record the exact deployed SHA.

## Monitoring

The Ingestion health workflow checks readiness and ingestion every five
minutes after repository variable `INGESTION_HEALTH_ENABLED` is `true`.
The 15-minute stale window accommodates ordinary polling/cache delays. GitHub
schedule delays can increase detection time; this is an initial monitor, not
an uptime guarantee. Set `TRACKFLIGHTS_HEALTH_BASE_URL` if the deployment changes.

Leave scheduled checks disabled until the endpoints are deployed and the owner
verifies their GitHub Actions failure-notification destination. Run the workflow
manually against a controlled failing test target and again against recovery;
verify receipt of failure and recovery notices before recording delivery as
complete. GitHub's notification settings determine actual delivery. The local
probe tests exercise failure/quiet/recovery response handling without changing
production data or sending notifications.

## Device diagnosis

Use the real receiver host/account, not an invented address. Read service status
and recent logs for both ingestors; inspect disk space; check readsb/tar1090's
local `aircraft.json`. Confirm the decoder's timestamp/messages advance before
restarting anything. Verify both ingestors and Vercel target the intended
Supabase project without printing keys. Separate decoder/radio failure from
ingestor/auth/schema failure. Do not recreate the database simply because the
map is stale. Apply only the repair supported by the evidence.

Rollback web code to the recorded deployment if needed. The additive heartbeat
table can remain; restoring old code does not require deleting it or any data.
