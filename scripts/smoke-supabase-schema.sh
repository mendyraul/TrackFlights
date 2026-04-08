#!/usr/bin/env bash
set -euo pipefail

required_tables=(
  flights_current
  analytics_hourly
  analytics_daily
  traffic_anomalies
)

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}" ]]; then
  echo "NEXT_PUBLIC_SUPABASE_* not set; running migration source-of-truth check instead"
  fail=0
  for table in "${required_tables[@]}"; do
    if ! grep -Rqi "create table[[:space:]]\+${table}" supabase/migrations; then
      echo "❌ Missing CREATE TABLE definition for ${table} in supabase/migrations"
      fail=1
    else
      echo "✅ ${table} defined in migrations"
    fi
  done
  [[ "$fail" -eq 0 ]] || exit 1
  echo "Migration source-of-truth check passed"
  exit 0
fi

fail=0
for table in "${required_tables[@]}"; do
  url="${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=*&limit=1"

  out_file="$(mktemp /tmp/trackflights-schema.XXXXXX.out)"
  status=$(curl -sS --connect-timeout 5 --max-time 20 \
    -H "apikey: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${NEXT_PUBLIC_SUPABASE_ANON_KEY}" \
    -o "${out_file}" -w "%{http_code}" "$url")
  body=$(cat "${out_file}")
  rm -f "${out_file}"

  if [[ "$status" != 2* ]]; then
    if echo "$body" | grep -q 'PGRST205'; then
      echo "❌ Missing table in schema cache: ${table}"
      fail=1
      continue
    fi

    echo "❌ API error on ${table}: HTTP ${status} ${body}"
    fail=1
    continue
  fi

  echo "✅ ${table} reachable"
done

if [[ "$fail" -ne 0 ]]; then
  echo "Schema smoke check failed"
  exit 1
fi

echo "Schema smoke check passed"
