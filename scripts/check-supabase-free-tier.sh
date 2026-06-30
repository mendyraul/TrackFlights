#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  # Load local planning assumptions without overwriting explicitly exported env.
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

SECONDS_PER_MONTH=$((30 * 24 * 60 * 60))
BYTES_PER_MB=$((1024 * 1024))
BYTES_PER_GB=$((1024 * 1024 * 1024))

SUPABASE_UNCACHED_EGRESS_LIMIT_GB=5
SUPABASE_CACHED_EGRESS_LIMIT_GB=5
SUPABASE_DB_SIZE_LIMIT_MB=500
SUPABASE_STORAGE_SIZE_LIMIT_MB=1024
SUPABASE_MAU_LIMIT=50000
SUPABASE_THIRD_PARTY_MAU_LIMIT=50000
SUPABASE_REALTIME_CONNECTION_LIMIT=200
SUPABASE_REALTIME_MESSAGES_LIMIT=2000000
SUPABASE_EDGE_FUNCTION_INVOCATIONS_LIMIT=500000

SNAPSHOT_REFRESH_SECONDS="${SNAPSHOT_REFRESH_SECONDS:-30}"
SUPABASE_SNAPSHOT_PAYLOAD_KB="${SUPABASE_SNAPSHOT_PAYLOAD_KB:-35}"
FLIGHTS_HISTORY_RETENTION_DAYS="${FLIGHTS_HISTORY_RETENTION_DAYS:-7}"
WEATHER_RETENTION_DAYS="${WEATHER_RETENTION_DAYS:-3}"
ANOMALIES_RETENTION_DAYS="${ANOMALIES_RETENTION_DAYS:-7}"
PREDICTIONS_ENABLED="${PREDICTIONS_ENABLED:-false}"
ANOMALY_DETECTION_ENABLED="${ANOMALY_DETECTION_ENABLED:-false}"

SUPABASE_EXPECTED_DB_SIZE_MB="${SUPABASE_EXPECTED_DB_SIZE_MB:-120}"
SUPABASE_EXPECTED_STORAGE_SIZE_MB="${SUPABASE_EXPECTED_STORAGE_SIZE_MB:-120}"
SUPABASE_EXPECTED_MONTHLY_ACTIVE_USERS="${SUPABASE_EXPECTED_MONTHLY_ACTIVE_USERS:-1000}"
SUPABASE_EXPECTED_MONTHLY_THIRD_PARTY_USERS="${SUPABASE_EXPECTED_MONTHLY_THIRD_PARTY_USERS:-0}"
SUPABASE_EXPECTED_PEAK_REALTIME_CONNECTIONS="${SUPABASE_EXPECTED_PEAK_REALTIME_CONNECTIONS:-25}"
SUPABASE_EXPECTED_REALTIME_MESSAGES_PER_MONTH="${SUPABASE_EXPECTED_REALTIME_MESSAGES_PER_MONTH:-0}"
SUPABASE_EXPECTED_EDGE_FUNCTION_INVOCATIONS="${SUPABASE_EXPECTED_EDGE_FUNCTION_INVOCATIONS:-0}"

failures=0
warnings=0

check_ratio() {
  local name="$1"
  local actual="$2"
  local limit="$3"
  local unit="$4"
  local ratio
  ratio=$(awk -v a="$actual" -v b="$limit" 'BEGIN { if (b == 0) { print 0 } else { printf "%.1f", (a / b) * 100 } }')

  if awk -v a="$actual" -v b="$limit" 'BEGIN { exit !(a > b) }'; then
    echo "FAIL ${name}: ${actual}${unit} > ${limit}${unit} (${ratio}%)"
    failures=$((failures + 1))
  elif awk -v a="$actual" -v b="$limit" 'BEGIN { exit !(a > (b * 0.85)) }'; then
    echo "WARN ${name}: ${actual}${unit} of ${limit}${unit} (${ratio}%)"
    warnings=$((warnings + 1))
  else
    echo "PASS ${name}: ${actual}${unit} of ${limit}${unit} (${ratio}%)"
  fi
}

require_minimum() {
  local name="$1"
  local actual="$2"
  local minimum="$3"
  local unit="$4"

  if awk -v a="$actual" -v b="$minimum" 'BEGIN { exit !(a < b) }'; then
    echo "FAIL ${name}: ${actual}${unit} < ${minimum}${unit}"
    failures=$((failures + 1))
  else
    echo "PASS ${name}: ${actual}${unit} >= ${minimum}${unit}"
  fi
}

require_maximum() {
  local name="$1"
  local actual="$2"
  local maximum="$3"
  local unit="$4"

  if awk -v a="$actual" -v b="$maximum" 'BEGIN { exit !(a > b) }'; then
    echo "FAIL ${name}: ${actual}${unit} > ${maximum}${unit}"
    failures=$((failures + 1))
  else
    echo "PASS ${name}: ${actual}${unit} <= ${maximum}${unit}"
  fi
}

echo "[supabase-free-tier] Checking config and planning assumptions"
echo "[supabase-free-tier] Source: .env (if present) plus environment overrides"

require_minimum "SNAPSHOT_REFRESH_SECONDS" "$SNAPSHOT_REFRESH_SECONDS" 30 "s"
require_maximum "FLIGHTS_HISTORY_RETENTION_DAYS" "$FLIGHTS_HISTORY_RETENTION_DAYS" 14 "d"
require_maximum "WEATHER_RETENTION_DAYS" "$WEATHER_RETENTION_DAYS" 7 "d"
require_maximum "ANOMALIES_RETENTION_DAYS" "$ANOMALIES_RETENTION_DAYS" 14 "d"

if [[ "$PREDICTIONS_ENABLED" == "true" ]]; then
  echo "WARN PREDICTIONS_ENABLED=true increases write and storage pressure on the free tier"
  warnings=$((warnings + 1))
else
  echo "PASS PREDICTIONS_ENABLED=false"
fi

if [[ "$ANOMALY_DETECTION_ENABLED" == "true" ]]; then
  echo "WARN ANOMALY_DETECTION_ENABLED=true increases Realtime and storage pressure"
  warnings=$((warnings + 1))
else
  echo "PASS ANOMALY_DETECTION_ENABLED=false"
fi

monthly_snapshot_reads=$(awk -v seconds="$SECONDS_PER_MONTH" -v refresh="$SNAPSHOT_REFRESH_SECONDS" 'BEGIN { printf "%.0f", seconds / refresh }')
estimated_uncached_egress_gb=$(awk -v reads="$monthly_snapshot_reads" -v kb="$SUPABASE_SNAPSHOT_PAYLOAD_KB" -v gb="$BYTES_PER_GB" 'BEGIN { printf "%.2f", (reads * kb * 1024) / gb }')

check_ratio "Supabase uncached egress" "$estimated_uncached_egress_gb" "$SUPABASE_UNCACHED_EGRESS_LIMIT_GB" " GB"
check_ratio "Supabase cached egress assumption" "0" "$SUPABASE_CACHED_EGRESS_LIMIT_GB" " GB"
check_ratio "Database size assumption" "$SUPABASE_EXPECTED_DB_SIZE_MB" "$SUPABASE_DB_SIZE_LIMIT_MB" " MB"
check_ratio "Storage size assumption" "$SUPABASE_EXPECTED_STORAGE_SIZE_MB" "$SUPABASE_STORAGE_SIZE_LIMIT_MB" " MB"
check_ratio "Monthly active users assumption" "$SUPABASE_EXPECTED_MONTHLY_ACTIVE_USERS" "$SUPABASE_MAU_LIMIT" ""
check_ratio "Monthly third-party users assumption" "$SUPABASE_EXPECTED_MONTHLY_THIRD_PARTY_USERS" "$SUPABASE_THIRD_PARTY_MAU_LIMIT" ""
check_ratio "Peak realtime connections assumption" "$SUPABASE_EXPECTED_PEAK_REALTIME_CONNECTIONS" "$SUPABASE_REALTIME_CONNECTION_LIMIT" ""
check_ratio "Realtime messages assumption" "$SUPABASE_EXPECTED_REALTIME_MESSAGES_PER_MONTH" "$SUPABASE_REALTIME_MESSAGES_LIMIT" ""
check_ratio "Edge function invocations assumption" "$SUPABASE_EXPECTED_EDGE_FUNCTION_INVOCATIONS" "$SUPABASE_EDGE_FUNCTION_INVOCATIONS_LIMIT" ""

echo "[supabase-free-tier] Estimated monthly uncached egress is based on ${monthly_snapshot_reads} snapshot reads at ~${SUPABASE_SNAPSHOT_PAYLOAD_KB} KB each"
echo "[supabase-free-tier] Manual dashboard follow-up: verify project usage alerts at 60% / 85% and confirm cached egress trend stays flat"

if [[ "$failures" -ne 0 ]]; then
  echo "[supabase-free-tier] Failed with ${failures} hard limit issue(s) and ${warnings} warning(s)"
  exit 1
fi

if [[ "$warnings" -ne 0 ]]; then
  echo "[supabase-free-tier] Passed with ${warnings} warning(s)"
  exit 0
fi

echo "[supabase-free-tier] Passed with all checks green"
