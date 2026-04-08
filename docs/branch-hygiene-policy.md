# Branch Hygiene Policy

## Goals
- Keep active work obvious.
- Remove stale merged branches safely.
- Never delete unmerged work without explicit human approval.

## Protected Branches
- `main`, `master`, `dev`, `develop`, `staging`, `release/*`

## Weekly Cadence
1. Run inventory:
   - `scripts/git/branch-hygiene-audit.sh main origin > docs/branch-hygiene-$(date +%F).md`
2. Run cleanup dry-run for merged `feature/*` branches:
   - `scripts/git/branch-hygiene.sh --remote origin --default-branch main`
3. Review output and confirm no active branch is listed.
4. Apply deletion only after confirmation:
   - `scripts/git/branch-hygiene.sh --apply --remote origin --default-branch main`

### Automation
- GitHub Actions workflow: `.github/workflows/branch-hygiene.yml`
- Scheduled run: Wednesdays 09:00 ET (`0 13 * * 3`) in dry-run mode.
- Manual runs support `apply=true`, but should only be used after explicit approval and audit review.

## Safety Rules
- Default mode is dry-run.
- Only merged `feature/*` branches are eligible for automated deletion.
- Unmerged stale branches require manual triage and explicit approval.
