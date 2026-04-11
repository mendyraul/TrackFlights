#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <signal-name>"
  echo "Example: $0 health-endpoint-failure"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/docs/evidence/phase2-alert-tests"
DATE_UTC="$(date -u +%F)"
RAW_SIGNAL="$1"
SIGNAL="$(echo "$RAW_SIGNAL" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+//; s/-+$//')"

if [[ -z "$SIGNAL" ]]; then
  echo "Error: signal-name is required and must contain at least one alphanumeric character"
  exit 1
fi

OUT_FILE="$OUT_DIR/${DATE_UTC}-${SIGNAL}-test.md"

mkdir -p "$OUT_DIR"

if [[ -f "$OUT_FILE" ]]; then
  echo "Evidence file already exists: $OUT_FILE"
  exit 0
fi

cat > "$OUT_FILE" <<TEMPLATE
# Alert Test Evidence — ${SIGNAL}
- Date: ${DATE_UTC}
- Environment:
- Operator:

## Trigger
- Steps:
- Trigger window:
- Rollback plan:

## Detection
- Threshold crossed at (UTC):
- Alert fired evidence (log/screenshot/link):
- Notification channel confirmation:

## Acknowledgement
- Acknowledged by:
- Acknowledgement timestamp (UTC):
- First mitigation action timestamp (UTC):

## Recovery
- Recovery action:
- Alert clear timestamp (UTC):
- Side-effect validation:

## Metrics
- TTA:
- TTR:

## Artifacts
- Logs:
- Screenshots:
- Related issue/PR:
TEMPLATE

echo "Created: $OUT_FILE"