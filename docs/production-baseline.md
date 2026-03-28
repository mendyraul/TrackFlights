# Production Baseline (Issue #1)

This document defines the **minimum production gate** for TrackFlights before feature work continues.

## 1) CI/CD Baseline

Workflow: `.github/workflows/ci.yml`

### Trigger policy
- Run on all pull requests.
- Run on pushes to protected integration branches (`main` now, `dev` when introduced).

### Required jobs
- **Phase 1 Baseline Check** (Node 20 + Python 3.11 via `npm run ci:baseline`):
  - `npm ci`
  - `npm run lint`
  - `npm run type-check`
  - `npm run build`
  - ingestor dependency install from `apps/ingestor/requirements.txt`
  - ingestor `pytest -q`

### Gate policy
- CI must be green before merge.
- No direct push to protected branches.

### Fail + rerun policy
- If CI fails, push a fix commit to the same PR branch (do not bypass checks).
- After flaky/network failures, rerun failed jobs once; if the second run fails, treat as a real failure and fix root cause.
- Do not merge with skipped or neutral required checks.

## 2) Branch Protection Strategy

Detailed policy is maintained in `docs/branch-protection.md` (Issue #9 / Slice B), including:
- exact required check name (`Phase 1 Baseline / Phase 1 Baseline Check`)
- PR-only merge + approval policy for `main` and `dev`
- 5-minute GitHub UI handoff checklist

Baseline requirement remains: no direct pushes to protected branches and no merges without required checks passing.

## 3) Environment Variable Strategy

Canonical environment matrix + ownership mapping:
- `docs/environment-matrix.md` (Issue #10 / Phase 1 Slice C)

Minimum baseline requirements:
- Frontend (`apps/web`) uses only public `NEXT_PUBLIC_*` variables at runtime.
- Ingestor (`apps/ingestor`) keeps service-role and provider keys server-side only.
- `.env.example` contains key names/placeholders only (no real values).
- CI baseline remains placeholder-safe for lint/type-check/build/pytest.

## 4) PR Gate Checklist + Deployment Preflight (Issue #11 / Slice D)

Canonical release-readiness checklist:
- `docs/release-readiness.md`
- `.github/pull_request_template.md`

One-command local preflight:
- `npm run release:preflight`

This preflight intentionally reuses `npm run ci:baseline` to keep local and CI behavior aligned.

## 5) Phase 4 Security Baseline (Issue #2 Slice 1)

Sage-style decomposition plan:
- `docs/phase-4-security-performance-plan.md`

One-command baseline security gate:
- `npm run security:baseline`

Current checks:
- `npm audit --omit=dev --audit-level=critical`
- `pip check` in `apps/ingestor/.venv` (when venv exists)

## 6) Phase 4 Runtime Hardening Checklist (Issue #2 Slice 2)

Canonical hardening checklist:
- `docs/runtime-hardening-checklist.md`

Scope covered:
- web header/CSP ownership and verification cadence
- secrets rotation cadence and evidence path
- dependency update cadence with SLA by severity
- backup + restore verification cadence

## 7) Phase 4 Performance SLO Baseline (Issue #2 Slice 3)

Canonical SLO baseline + measurement commands:
- `docs/performance-slo-baseline.md`

Scope covered:
- web health latency budget (p50/p95/p99)
- ingestor cycle timing + queue lag targets
- alert thresholds + owner routing

## 8) Phase 4 Release-Readiness Signoff (Issue #2 Slice 4)

Canonical signoff checklist and evidence workflow:
- `docs/release-readiness.md`
- `npm run ops:release-evidence -- <rc-id>`
- evidence path: `docs/evidence/release-candidates/<rc-id>.md`

Hard requirement per release candidate:
- capture one **last known good** snapshot (UTC timestamp, commit SHA, rollback target)

## 9) Phase 3 Scale + Failover Baseline (Issue #4)

Canonical decomposition + execution tracker:
- `docs/phase-3-scale-plan.md`
- `docs/adr/0001-ingestor-scale-failover.md`
- `docs/realtime-throughput-baseline.md`
- `docs/evidence/realtime-throughput-template.md`

One-command failover drill (systemd-managed ingestor):
- `npm run ops:failover-drill -- <systemd-service-name>`
- default service name: `mia-ingestor.service`

This drill validates crash recovery (process kill -> service restart with new PID) and emits journal evidence for runbook records.

## 10) Definition of Done for Baseline

- [x] CI workflow committed and running in GitHub Actions.
- [x] Deterministic installs (`npm ci`) and lockfile committed.
- [x] Lint/type-check/build + ingestor pytest in CI.
- [x] Baseline branch protection and env strategy documented.
- [ ] Branch protection rules applied in GitHub settings.

Owner action remaining: enable the branch protection settings in repository configuration.
