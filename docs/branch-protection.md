# Branch Protection Policy (Phase 1 / Slice B)

Issue: #9  
Parent: #1

This is the exact merge-safety policy for TrackFlights and the fast handoff checklist Raul can apply in GitHub in under 5 minutes.

## Required status checks (exact names)

Workflow file: `.github/workflows/ci.yml`  
Workflow name: `Phase 1 Baseline`  
Job name: `Phase 1 Baseline Check`

Required check context to select in GitHub:
- `Phase 1 Baseline / Phase 1 Baseline Check`

## Merge policy

### `main` (release branch)
- PR-only merges (no direct pushes)
- Minimum approvals: **1**
- Dismiss stale approvals when new commits are pushed
- Require status checks before merge:
  - `Phase 1 Baseline / Phase 1 Baseline Check`
- Require branch to be up to date before merging
- Do not allow bypassing required settings (including admins)

### `dev` (integration branch)
- PR-only merges from `feature/*`
- Minimum approvals: **1**
- Dismiss stale approvals when new commits are pushed
- Require status checks before merge:
  - `Phase 1 Baseline / Phase 1 Baseline Check`
- Require branch to be up to date before merging
- Do not allow bypassing required settings (including admins)

## 5-minute GitHub setup checklist

Path: **GitHub → TrackFlights → Settings → Branches**

### Rule 1: `main`
- [ ] Add branch protection rule (or ruleset target) for `main`
- [ ] Require a pull request before merging
- [ ] Require approvals: `1`
- [ ] Dismiss stale approvals when new commits are pushed
- [ ] Require status checks to pass before merging
  - [ ] Select `Phase 1 Baseline / Phase 1 Baseline Check`
- [ ] Require branches to be up to date before merging
- [ ] Restrict direct pushes / enforce PR-only merge path
- [ ] Disable bypass for admins and other roles

### Rule 2: `dev`
- [ ] Add branch protection rule (or ruleset target) for `dev`
- [ ] Require a pull request before merging
- [ ] Require approvals: `1`
- [ ] Dismiss stale approvals when new commits are pushed
- [ ] Require status checks to pass before merging
  - [ ] Select `Phase 1 Baseline / Phase 1 Baseline Check`
- [ ] Require branches to be up to date before merging
- [ ] Restrict direct pushes / enforce PR-only merge path
- [ ] Disable bypass for admins and other roles

## Decomposition applied (32k-safe)

- Slice B1: identify exact CI check context from workflow/job names
- Slice B2: codify `main` + `dev` rule set with explicit review/check requirements
- Slice B3: produce fast, deterministic GitHub UI checklist for owner handoff

All three slices are complete in this document.
