# Regional FlightAware rollout

Receiver positions are highlighter green (#39FF14); FlightAware's daily regional snapshot is highlighter yellow (#FFFF00). Source filters apply to both the map and aircraft table. Old provider positions are explicitly historical, fade after five minutes and expire at 48 hours. A daily snapshot is partial, not comprehensive live coverage. MIA's partial schedules are a separate board. Airport dashboards are deferred.

## Budget and deployment

The shared application ceiling is $9.50/month in usage, before credits. FlightAware currently publishes $0.05 per regional search result set and $0.005 per airport board result set (up to 15 records/set). Verify account-specific pricing and feeder credit in the AeroAPI portal. Other applications using the key are outside this local ledger.

Four regional pages after 12 UTC daily plus four one-page boards every six hours cost at most $8.68 in a 31-day month at these rates. The worker wakes every 15 minutes and durable reservation windows suppress duplicates across restarts. Failed requests retain their maximum reservation; no unaccounted automatic retries occur. The ledger locks across processes, writes atomically and fails closed on corruption or save failure. Never delete it mid-month. Legacy query counts migrate at the conservative $0.05/page rate; reconcile against portal month-to-date usage before enabling polling. Missing successful windows in an old ledger may cause a first refresh, charged against the remaining balance.

1. Record deployed web/receiver versions and environment paths. Apply all outstanding migrations in order, including source observations and schedule snapshots. Run SQL permission tests and existing schema smoke checks. Migrations repair explicit telemetry table grants as well.
2. Verify the receiver target, account and project directory. Deploy the ingestor; set the overrides from `infra/systemd/env.aeroapi.example` including the $9.50 cap. Preserve its existing ledger path. Ensure `.state` is writable by the service account. Do not copy example paths over a real deployment blindly.
3. Enable bounded local track logging using `infra/systemd/env.adsb.example`. Confirm disk headroom and the track-log stats utility. Receiver-only observations continue to feed traffic history and model training.
4. Deploy the web app. The added snapshot fields are `schedules`, `schedulePartial`, and per-aircraft `data_source`, `observed_at`, `fetched_at`. Receiver positions and provider observations are independently stored. Optional-table failures preserve the legacy reader during staged deployment.
5. Verify fresh receiver heartbeat and hourly history, stationary aircraft timestamps, regional positions after the next daily window, MIA schedules and correct source labels. Restart the AeroAPI unit and verify no duplicate paid window. Observe advancing receiver telemetry for 30–60 minutes.
6. Enable `INGESTION_HEALTH_ENABLED=true` only after testing the monitoring probe and verifying failure/recovery delivery to the owner's configured GitHub Actions notification destination. An enabled schedule alone is not proof of delivered notifications.

Missing heartbeat/history diagnosis: compare local decoder activity, receiver logs (`Receiver heartbeat write failed`, `Receiver telemetry write failed`, `Source observation write failed`), deployed SHA, migration inventory, table grants, and Supabase project identity. Do not recreate the database or fabricate a device address.

## Models and showcase

Keep telemetry collection running. After roughly two weeks of tracks, evaluate phase classification; after roughly four weeks of hourly history, evaluate traffic forecasting using `apps/ml/README.md`. Export only models beating held-out baselines. These elapsed-data milestones cannot be completed with synthetic production results. Populate actual hardware photos and measured range when available; never substitute invented evidence.

## Rollback and evidence

Disable the AeroAPI unit, roll back web/receiver code to recorded versions, and retain additive tables plus the budget ledger. Record applied migration versions, deployed SHA, actual portal usage, heartbeat/history timestamps, notification delivery evidence, and real screenshots. Production deployment and notification delivery remain unverified until access and those observations are available.
