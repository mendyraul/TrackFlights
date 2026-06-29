# Docs Index (Canonical)

Use these as the source of truth:

- `deployment.md` — deployment steps (Vercel, Supabase, Pi ingestor)
- `production-readiness.md` — go-live source of truth: current green status + remaining owner action list
- `production-baseline.md` — production readiness baseline
- `security-hardening-checklist.md` — security controls + release gate
- `observability-reliability-runbook.md` — monitoring, incident response, reliability checks
- `performance-baseline.md` — load-test protocol and API latency baseline capture commands
- `release-checklist.md` — release execution checklist
- `cost-guardrails.md` — budget thresholds, alert setup, and spend-spike triage runbook
- `rollback-runbook.md` — rollback steps
- `branch-hygiene-policy.md` — branch lifecycle policy
- `database.md` — schema/data model
- `pipeline.md` — ingestion + processing flow
- `flightaware-migration.md` — hosted FlightAware migration path and Raspberry Pi decommissioning notes
- `hardware-adsb-ingest.md` — self-hosted ADS-B receiver hardware guide (antenna/SDR/Pi, KMIA 1090 MHz)
- `etl-pipeline.md` — Pi ADS-B → Supabase ETL, egress-safe (the `adsb1090` provider + cached read path)
- `phase-3-queue-retry-idempotency.md` — queue contract, retry policy, and idempotent write strategy

Historical and slice-specific docs were moved to `docs/archive/`.
