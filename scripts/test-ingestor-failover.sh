#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${1:-mia-ingestor.service}"
TIMEOUT_SECONDS="${FAILOVER_TIMEOUT_SECONDS:-40}"
POLL_SECONDS=2

if ! command -v systemctl >/dev/null 2>&1; then
  echo "systemctl not found on this host; skip failover drill"
  exit 0
fi

echo "[failover] checking service active: ${SERVICE_NAME}"
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "[failover] service is not active: ${SERVICE_NAME}"
  echo "[failover] start it first, then rerun"
  exit 1
fi

MAIN_PID="$(systemctl show -p MainPID --value "$SERVICE_NAME")"
if [[ -z "$MAIN_PID" || "$MAIN_PID" == "0" ]]; then
  echo "[failover] unable to resolve MainPID for ${SERVICE_NAME}"
  exit 1
fi

echo "[failover] killing main pid ${MAIN_PID} to simulate primary worker crash"
kill -9 "$MAIN_PID"

deadline=$((SECONDS + TIMEOUT_SECONDS))
while (( SECONDS < deadline )); do
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    NEW_PID="$(systemctl show -p MainPID --value "$SERVICE_NAME")"
    if [[ -n "$NEW_PID" && "$NEW_PID" != "0" && "$NEW_PID" != "$MAIN_PID" ]]; then
      echo "[failover] PASS: ${SERVICE_NAME} restarted with pid ${NEW_PID}"
      echo "[failover] recent logs:"
      journalctl -u "$SERVICE_NAME" -n 25 --no-pager || true
      exit 0
    fi
  fi
  sleep "$POLL_SECONDS"
done

echo "[failover] FAIL: ${SERVICE_NAME} did not recover with a new pid in ${TIMEOUT_SECONDS}s"
systemctl status "$SERVICE_NAME" --no-pager || true
exit 1
