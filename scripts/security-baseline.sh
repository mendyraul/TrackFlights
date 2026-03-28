#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[security] npm audit (production deps, critical threshold)"
npm audit --omit=dev --audit-level=critical

if [ -d "apps/ingestor/.venv" ]; then
  echo "[security] pip check (apps/ingestor/.venv)"
  # shellcheck disable=SC1091
  source apps/ingestor/.venv/bin/activate
  pip check
  deactivate
else
  echo "[security] apps/ingestor/.venv not found; skipping pip check"
fi

echo "[security] baseline checks passed"
