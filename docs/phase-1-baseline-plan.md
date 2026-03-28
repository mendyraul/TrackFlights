# Phase 1 Production Baseline Plan (Issue #1)

This plan breaks Issue #1 into four small, low-risk slices.

## Slice 1 (this run): Baseline verification script
- Add a single root script that mirrors CI checks end-to-end:
  1. `npm ci`
  2. web `lint`, `type-check`, and `build`
  3. ingestor `pytest` with CI-safe placeholder env vars
- Expose it as `npm run ci:baseline` for one-command local gating.

## Slice 2: CI trigger and policy validation
- [x] Updated `.github/workflows/ci.yml` to run baseline checks on pull requests targeting `dev` and pushes to `dev/main`.
- [x] Aligned a stable required check name for branch protection: `Phase 1 Baseline / Phase 1 Baseline Check`.
- [x] Consolidated gate execution through `npm run ci:baseline` so CI and local baseline checks stay in sync.

## Slice 3: Branch protection handoff checklist
- [x] Added explicit owner checklist section in `docs/production-baseline.md` documenting exact GitHub branch protection toggles for `main`.

## Slice 4: Evidence + status sync
- [x] Run baseline checks on `feature/phase1-ci-baseline` and capture exact command + result in task summary.
- [x] Keep local/CI parity by using the same gate command: `npm run ci:baseline`.
- [x] Verify branch/PR sync context before handoff:
  - `git rev-parse --abbrev-ref HEAD` → must be `feature/phase1-ci-baseline`
  - `git status --short --branch` → include in evidence so reviewers see pending tracked scope
  - PR target remains `dev`; compare URL pattern: `https://github.com/mendyraul/TrackFlights/compare/dev...feature/phase1-ci-baseline`
- [x] Append one STATUS.md line for Issue #1 Slice 4 completion.

### Slice 4 quick verification commands
```bash
git rev-parse --abbrev-ref HEAD
git status --short --branch
npm run ci:baseline
```

## Slice 5 (Issue #10 / Slice C): Environment matrix + secrets mapping
- [x] Added `docs/environment-matrix.md` with variable ownership, runtime scope, secret classification, and source-of-truth mapping.
- [x] Documented per-environment setup responsibilities (Vercel vs Pi ingestor vs GitHub Actions).
- [x] Added explicit guardrails + rotation/checklist to reduce accidental secret exposure.

