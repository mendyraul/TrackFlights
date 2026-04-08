#!/usr/bin/env bash
set -euo pipefail

default_branch="${1:-main}"
remote="${2:-origin}"

printf "# Branch Hygiene Audit\n\n"
printf "Generated: %s\n\n" "$(date -u +'%Y-%m-%d %H:%M:%S UTC')"
printf "Default branch: %s/%s\n\n" "$remote" "$default_branch"

echo "## Local branches (excluding $default_branch)"
git for-each-ref refs/heads --format='%(refname:short)|%(committerdate:short)|%(authorname)|%(subject)' \
  | grep -v "^${default_branch}|" \
  | sort || true

echo
echo "## Remote branches already merged into $remote/$default_branch"
git branch -r --merged "$remote/$default_branch" \
  | sed 's/^..//' \
  | grep "^$remote/" \
  | grep -vE "^$remote/(${default_branch}|HEAD)$" \
  | sort || true

echo
echo "## Remote branches NOT merged into $remote/$default_branch"
git branch -r --no-merged "$remote/$default_branch" \
  | sed 's/^..//' \
  | grep "^$remote/" \
  | grep -vE "^$remote/(${default_branch}|HEAD)$" \
  | sort || true
