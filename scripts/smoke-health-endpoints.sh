#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

declare -a ENDPOINTS=(
  "/"
  "/api/healthz/live"
  "/api/healthz/ready"
)

for endpoint in "${ENDPOINTS[@]}"; do
  code=$(curl -sS -o /tmp/trackflights-health.out -w "%{http_code}" "${BASE_URL}${endpoint}")
  if [[ "$code" != "200" ]]; then
    echo "FAIL ${endpoint} -> HTTP ${code}"
    cat /tmp/trackflights-health.out
    exit 1
  fi
  echo "OK ${endpoint} -> HTTP ${code}"
done

echo "Health smoke passed for ${BASE_URL}"
