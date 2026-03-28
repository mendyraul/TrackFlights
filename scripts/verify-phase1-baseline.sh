#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[phase1] Installing Node workspace dependencies (npm ci)..."
npm ci

echo "[phase1] Running web lint..."
npm run lint

echo "[phase1] Running web type-check..."
npm run type-check

echo "[phase1] Running web build..."
npm run build

echo "[phase1] Running ingestor tests..."
pushd apps/ingestor >/dev/null
python3 -m venv .venv
. .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
pip install -r requirements.txt >/dev/null
SUPABASE_URL="https://example.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="ci-placeholder-key" \
pytest -q
deactivate
popd >/dev/null

echo "[phase1] Baseline checks passed."
