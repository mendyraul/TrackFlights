#!/usr/bin/env bash
set -euo pipefail

URL="${1:-}"
SAMPLES="${2:-50}"
OUTFILE="${3:-docs/evidence/perf/api-health-latency-seconds.txt}"

if [[ -z "$URL" ]]; then
  echo "Usage: scripts/perf/capture-health-latency.sh <health-url> [samples] [outfile]" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTFILE")"
: > "$OUTFILE"

for ((i=1; i<=SAMPLES; i++)); do
  curl -sS -o /dev/null -w "%{time_total}\n" "$URL" >> "$OUTFILE"
done

echo "Captured $SAMPLES samples to $OUTFILE"
node scripts/perf/summarize-latency.mjs "$OUTFILE"
