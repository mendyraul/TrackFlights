#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/docs/evidence/phase2-alert-tests"
DATE_UTC="${1:-$(date -u +%F)}"
OUT_FILE="$OUT_DIR/${DATE_UTC}.md"

mkdir -p "$OUT_DIR"

if [[ -f "$OUT_FILE" ]]; then
  echo "Evidence file already exists: $OUT_FILE"
  exit 0
fi

cat > "$OUT_FILE" <<TEMPLATE
# Phase 2 Alert Test Evidence — ${DATE_UTC}

- Generated (UTC): $(date -u +"%Y-%m-%d %H:%M:%S")
- Operator:
- Environment: (prod/staging)

## A) Web health alert
- Monitor event id:
- First failure timestamp (UTC):
- Alert trigger timestamp (UTC):
- Recovery timestamp (UTC):
- Evidence links/logs:

## B) Ingestor heartbeat-miss alert
- Service stop timestamp (UTC):
- Alert trigger timestamp (UTC):
- Service restart timestamp (UTC):
- Recovery timestamp (UTC):
- Evidence links/logs:

## C) Supabase auth failure alert
- Auth failure log timestamp (UTC):
- Alert trigger timestamp (UTC):
- Clear/recovery timestamp (UTC):
- Evidence links/logs:

## Gate
- [ ] All three alert scenarios validated
- [ ] Evidence linked back to Issue #3
TEMPLATE

echo "Created: $OUT_FILE"
