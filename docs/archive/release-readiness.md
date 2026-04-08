# Release Readiness Baseline (Phase 1 / Slice D)

This document defines the minimum pre-merge release gate for TrackFlights PRs.

## One-command preflight
Run from repo root:

```bash
npm run release:preflight
```

The preflight command:
1. refuses to run on `main`/`master`
2. runs the same deterministic baseline gate as CI (`npm run ci:baseline`)

## Phase 4 signoff checklist (required for release candidates)
For each release candidate, create a signoff evidence file:

```bash
npm run ops:release-evidence -- rc-YYYYMMDD-HHMM
```

Evidence path:
- `docs/evidence/release-candidates/<rc-id>.md`

Required checklist in that file:
1. baseline + security gates passed (`npm run release:preflight`, `npm run security:baseline`)
2. performance SLO spot-check evidence linked
3. latest alert-test evidence linked
4. **last known good snapshot recorded** (timestamp, commit SHA, rollback target)

A release candidate is not signoff-ready until all four sections are complete.

## Required PR checklist
Use `.github/pull_request_template.md` and confirm:
- preflight passed locally
- required CI check is green (`Phase 1 Baseline / Phase 1 Baseline Check`)
- PR targets `dev` from `feature/*`
- env/secrets docs are updated when relevant

## Baseline policy links
- CI and gate policy: `docs/production-baseline.md`
- branch protection specifics: `docs/branch-protection.md`
- env ownership + secret mapping: `docs/environment-matrix.md`
