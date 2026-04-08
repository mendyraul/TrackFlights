# Rollback Runbook

Use this runbook when a production deploy causes regressions.

## Rollback Triggers

Initiate rollback if any of the following persists for more than 10 minutes after deployment:

- Critical path unavailable (site down / 5xx spike)
- Ingestor fails repeatedly or stops writing records
- Realtime updates stop flowing
- Severe data integrity issue after migration

## Severity Triage

1. **SEV-1**: Site unavailable, ingestion halted, or corrupt writes in production.
2. **SEV-2**: Partial feature breakage with active workaround.

For SEV-1, rollback immediately while investigation continues.

## Rollback Procedure

## A) Frontend Rollback (Vercel)

1. Open Vercel project deployments.
2. Identify last known-good production deployment.
3. Promote/redeploy that version to production.
4. Verify traffic is serving the restored build.

## B) Ingestor Rollback (Raspberry Pi)

1. SSH to Pi host.
2. Checkout previous known-good commit/tag in deploy directory.
3. Restart service:
   - `sudo systemctl restart trackflights-ingestor`
4. Confirm status and logs:
   - `sudo systemctl status trackflights-ingestor --no-pager`
   - `journalctl -u trackflights-ingestor -n 100 --no-pager`

## C) Database Rollback

- Prefer forward-fix migrations when safe.
- If destructive migration caused breakage, restore from latest verified backup/snapshot using documented Supabase recovery procedure.
- Re-run smoke checks after DB recovery.

## Verification After Rollback

- Production site loads successfully.
- New ingest events appear in database.
- Realtime subscriptions resume.
- Error rates return to pre-release baseline.

## Communication Template

- Incident start time:
- Trigger observed:
- Rollback start/end:
- Restored version/commit:
- Current user impact:
- Follow-up issue/PR links:

## Follow-up (Required)

1. Open incident issue with root-cause analysis.
2. Add preventive action items to backlog.
3. Update release checklist or tests to prevent repeat failure.
