#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" == "main" || "$CURRENT_BRANCH" == "master" ]]; then
  echo "[preflight] Refusing to run on protected branch: $CURRENT_BRANCH"
  echo "[preflight] Switch to a feature branch and rerun."
  exit 1
fi

echo "[preflight] Branch: $CURRENT_BRANCH"
echo "[preflight] Running Phase 1 baseline gate..."
npm run ci:baseline

echo "[preflight] Release readiness preflight passed."
