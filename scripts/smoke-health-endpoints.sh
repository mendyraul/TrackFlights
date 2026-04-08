#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

declare -a ENDPOINTS=(
  "/"
  "/api/healthz/live"
  "/api/healthz/ready"
)

for endpoint in "${ENDPOINTS[@]}"; do
  out_file="$(mktemp /tmp/trackflights-health.XXXXXX.out)"
  code=$(curl -sS --connect-timeout 5 --max-time 15 -o "${out_file}" -w "%{http_code}" "${BASE_URL}${endpoint}")

  case "$code" in
    200)
      echo "OK ${endpoint} -> HTTP ${code}"
      ;;
    401|403)
      echo "AUTH FAILURE ${endpoint} -> HTTP ${code}"
      cat "${out_file}"
      rm -f "${out_file}"
      exit 2
      ;;
    *)
      echo "APP FAILURE ${endpoint} -> HTTP ${code}"
      cat "${out_file}"
      rm -f "${out_file}"
      exit 1
      ;;
  esac

  rm -f "${out_file}"
done

echo "Health smoke passed for ${BASE_URL}"
