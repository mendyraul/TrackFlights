#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/docs/evidence/release-candidates"
RC_ID="${1:-rc-$(date -u +%Y%m%d-%H%M)}"
OUT_FILE="$OUT_DIR/${RC_ID}.md"

mkdir -p "$OUT_DIR"

if [[ -f "$OUT_FILE" ]]; then
  echo "Release evidence file already exists: $OUT_FILE"
  exit 0
fi

cat > "$OUT_FILE" <<TEMPLATE
# Release Candidate Evidence — ${RC_ID}

- Generated (UTC): $(date -u +"%Y-%m-%d %H:%M:%S")
- Operator:
- Environment: (staging/prod)
- Related PR(s):
- Related issue(s):

## 1) Baseline + Security Gates
- [ ] 'npm run release:preflight' passed
- [ ] 'npm run security:baseline' passed
- Command output/log links:

## 2) Performance SLO Spot Check
- [ ] Web '/api/health' p95 under baseline target (<=250ms)
- [ ] Ingestor cycle + queue lag within targets
- Evidence links:

## 3) Alerting + Observability
- [ ] Latest alert-test evidence linked ('docs/evidence/phase2-alert-tests/')
- [ ] No unresolved critical alerts at signoff time
- Evidence links:

## 4) Last Known Good Snapshot (required)
- Snapshot timestamp (UTC):
- Commit SHA:
- Web health sample output:
- Ingestor heartbeat sample output:
- Rollback target commit/tag:

## Signoff
- [ ] Engineering signoff
- [ ] Product/owner signoff
- Notes:
TEMPLATE

echo "Created: $OUT_FILE"
