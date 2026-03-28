# Phase 4 — Security + Performance + Release Readiness (Issue #2)

Sage-style decomposition into small slices that fit local 32k context execution.

## Slice 1: Security baseline gate (this run)
- Add a single command to run minimal security checks before release:
  - `npm audit --omit=dev --audit-level=critical`
  - `pip check` inside `apps/ingestor/.venv` when present
- Document expected pass/fail behavior and remediation ownership.

## Slice 2: Runtime hardening checklist ✅
- Added concrete production hardening checklist for web + ingestor:
  - headers/CSP ownership
  - secrets rotation cadence
  - dependency update cadence
  - backup restore verification cadence
- Deliverable: `docs/runtime-hardening-checklist.md`
- Linked from `docs/production-baseline.md`

## Slice 3: Performance SLO baseline ✅
- Added baseline SLO targets + measurement commands for:
  - web API health latency budget
  - ingestor cycle timing + queue lag target
  - alert thresholds + owner routing
- Deliverable: `docs/performance-slo-baseline.md`

## Slice 4: Release-readiness signoff expansion ✅
- Extended release-readiness docs with Phase 4 signoff checklist + evidence capture path.
- Added release evidence template generator (`npm run ops:release-evidence -- <rc-id>`).
- Required one “last known good” evidence snapshot per release candidate.
