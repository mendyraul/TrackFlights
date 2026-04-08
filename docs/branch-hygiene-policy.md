# Branch Hygiene Policy

This repo follows a conservative cleanup workflow:

1. Never push directly to `main`.
2. Feature work happens on `feature/*` branches via PR.
3. A branch is eligible for deletion only after:
   - PR is merged, and
   - branch appears in `git branch -r --merged origin/main`.
4. Keep long-lived protected branches (`main`, `dev` if present).
5. Run `scripts/git/branch-hygiene-audit.sh` before cleanup windows.

## Safe cleanup commands (manual confirmation required)

- Delete one merged remote branch:
  - `git push origin --delete <branch>`
- Delete local tracking branch:
  - `git branch -d <branch>`

Do not bulk-delete without verifying branch purpose and PR status.
