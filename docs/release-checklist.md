# Release Checklist

Use this checklist before every production release.

## 1) Preflight

- [ ] `main` is up to date with latest approved PRs.
- [ ] CI checks for the release commit/PR are green.
- [ ] Required environment variables exist in Vercel and Raspberry Pi runtime.
- [ ] Supabase migrations are reviewed and ordered correctly.
- [ ] Any breaking changes are documented in PR notes.

## 2) Deploy

### Frontend (Vercel)

- [ ] Merge release PR to `main` (no direct pushes).
- [ ] Confirm Vercel production deployment starts automatically.
- [ ] Confirm deployment finishes successfully (no failed build step).

### Ingestor (Raspberry Pi)

- [ ] Pull latest `main` on the Pi deployment path.
- [ ] Restart ingestor service:
  - `sudo systemctl restart trackflights-ingestor`
- [ ] Verify service health:
  - `sudo systemctl status trackflights-ingestor --no-pager`

### Database (Supabase)

- [ ] Apply migrations (if any) using approved migration workflow.
- [ ] Confirm migration completes with no errors.

## 3) Post-deploy Verification

- [ ] App loads in production and key pages render.
- [ ] Realtime feed is active (new flights/events appear).
- [ ] Ingestor logs show successful polling and inserts.
- [ ] Error rate does not spike after deploy.
- [ ] Spot-check arrivals/departures board for sane data.

## 4) Release Evidence

- [ ] Link release PR.
- [ ] Link Vercel deployment URL/build log.
- [ ] Note ingestor restart timestamp.
- [ ] Note any migration IDs applied.
- [ ] Record verification outcome and operator initials.

## 5) Exit Criteria

Release is complete only when all boxes above are checked and no rollback triggers are active.
