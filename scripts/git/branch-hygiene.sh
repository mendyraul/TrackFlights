#!/usr/bin/env bash
set -euo pipefail

MODE="dry-run"
REMOTE="origin"
DEFAULT_BRANCH="main"
PROTECT_REGEX='^(main|master|dev|develop|staging|release/.*)$'

usage() {
  cat <<USAGE
Usage: $0 [--apply] [--remote origin] [--default-branch main] [--protect-regex '<regex>']

Deletes ONLY remote feature/* branches that are already merged into <remote>/<default-branch>.
Default mode is dry-run.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) MODE="apply"; shift ;;
    --remote) REMOTE="${2:-}"; shift 2 ;;
    --default-branch) DEFAULT_BRANCH="${2:-}"; shift 2 ;;
    --protect-regex) PROTECT_REGEX="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$REMOTE" || -z "$DEFAULT_BRANCH" ]]; then
  echo "remote and default branch are required" >&2
  exit 1
fi

git fetch "$REMOTE" --prune >/dev/null

mapfile -t MERGED_REMOTE_BRANCHES < <(
  git branch -r --merged "$REMOTE/$DEFAULT_BRANCH" \
    | sed 's/^..//' \
    | grep "^$REMOTE/feature/" \
    | sed "s#^$REMOTE/##" \
    | sort -u || true
)

if [[ ${#MERGED_REMOTE_BRANCHES[@]} -eq 0 ]]; then
  echo "No merged remote feature branches found."
  exit 0
fi

echo "Mode: $MODE"
echo "Remote: $REMOTE"
echo "Base: $REMOTE/$DEFAULT_BRANCH"
echo

echo "Merged candidate branches:"
printf ' - %s\n' "${MERGED_REMOTE_BRANCHES[@]}"
echo

DELETED=0
for BRANCH in "${MERGED_REMOTE_BRANCHES[@]}"; do
  if [[ "$BRANCH" =~ $PROTECT_REGEX ]]; then
    echo "SKIP protected: $BRANCH"
    continue
  fi

  if [[ "$MODE" == "dry-run" ]]; then
    echo "DRY-RUN delete: $REMOTE/$BRANCH"
  else
    echo "Deleting: $REMOTE/$BRANCH"
    git push "$REMOTE" --delete "$BRANCH"
    DELETED=$((DELETED + 1))
  fi
done

if [[ "$MODE" == "apply" ]]; then
  echo
  echo "Deleted $DELETED remote branches."
else
  echo
  echo "Dry-run complete. Re-run with --apply to delete merged branches."
fi
