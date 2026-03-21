#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
LOG_DIR="$APP_DIR/logs"
RUNTIME_DIR="$HOME/.codex/tmp/ai-mission-control-runtime"
STATUS_FILE="$RUNTIME_DIR/watchdog-status.json"
WATCHDOG_LOG_FILE="$RUNTIME_DIR/watchdog-events.log"
RESTART_COUNT_FILE="$RUNTIME_DIR/watchdog-restart-count"
LAUNCHER="${LAUNCHER:-$APP_DIR/Start or Restart App.command}"
HOST="127.0.0.1"
PORT="8080"
SUPABASE_URL="http://127.0.0.1:54321"
WATCHDOG_INTERVAL_SECONDS="${WATCHDOG_INTERVAL_SECONDS:-300}"
RECOVERY_LABEL="com.codex.ai-mission-control.watchdog-recovery"
RECOVERY_RUNTIME_LOG="$RUNTIME_DIR/watchdog-recovery.log"

CURL_BIN="$(command -v curl || true)"
PYTHON_BIN="$(command -v python3 || true)"
LAUNCHCTL_BIN="$(command -v launchctl || true)"

mkdir -p "$LOG_DIR" "$RUNTIME_DIR"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_watchdog() {
  printf '[%s] %s\n' "$(timestamp)" "$*" >> "$WATCHDOG_LOG_FILE"
}

read_restart_count() {
  if [ -f "$RESTART_COUNT_FILE" ]; then
    cat "$RESTART_COUNT_FILE" 2>/dev/null || printf '0\n'
    return 0
  fi

  printf '0\n'
}

increment_restart_count() {
  local current_count
  current_count="$(read_restart_count)"
  current_count="${current_count:-0}"
  current_count=$((current_count + 1))
  printf '%s\n' "$current_count" > "$RESTART_COUNT_FILE"
  printf '%s\n' "$current_count"
}

check_frontend() {
  local status_line
  status_line="$("$CURL_BIN" -sI --max-time 5 "http://$HOST:$PORT" | head -n 1 || true)"

  if [[ "$status_line" == *"200"* ]]; then
    printf 'true\t%s\t%s\n' "$status_line" "HTTP check returned 200 OK."
    return 0
  fi

  if [ -z "$status_line" ]; then
    printf 'false\tunreachable\t%s\n' "No response from the frontend HTTP check."
    return 1
  fi

  printf 'false\t%s\t%s\n' "$status_line" "Frontend did not return HTTP 200."
  return 1
}

check_functions() {
  local response
  response="$("$CURL_BIN" -s --max-time 5 "$SUPABASE_URL/functions/v1/chat" || true)"

  if [ -n "$response" ] && [[ "$response" != *"name resolution failed"* ]]; then
    printf 'true\t%s\t%s\n' "$(printf '%s' "$response" | head -c 160)" "Functions gateway responded."
    return 0
  fi

  if [[ "$response" == *"name resolution failed"* ]]; then
    printf 'false\t%s\t%s\n' "$(printf '%s' "$response" | head -c 160)" "Functions gateway is up but the Edge Functions network is not ready."
    return 1
  fi

  printf 'false\tunreachable\t%s\n' "No response from the functions gateway check."
  return 1
}

write_status() {
  local healthy="$1"
  local action="$2"
  local frontend_healthy="$3"
  local frontend_status="$4"
  local frontend_message="$5"
  local functions_healthy="$6"
  local functions_status="$7"
  local functions_message="$8"
  local restart_count="$9"

  "$PYTHON_BIN" - "$STATUS_FILE" "$healthy" "$action" "$WATCHDOG_INTERVAL_SECONDS" "$frontend_healthy" "$frontend_status" "$frontend_message" "$functions_healthy" "$functions_status" "$functions_message" "$restart_count" "$WATCHDOG_LOG_FILE" "$LOG_DIR/app-frontend.log" "$LOG_DIR/app-backend.log" <<'PY'
import json
import sys
from datetime import datetime, timezone

(
    _,
    status_file,
    healthy,
    action,
    interval_seconds,
    frontend_healthy,
    frontend_status,
    frontend_message,
    functions_healthy,
    functions_status,
    functions_message,
    restart_count,
    watchdog_log,
    frontend_log,
    backend_log,
) = sys.argv

payload = {
    "checked_at": datetime.now(timezone.utc).isoformat(),
    "healthy": healthy == "true",
    "interval_seconds": int(interval_seconds),
    "last_action": action,
    "restart_count": int(restart_count),
    "frontend": {
        "healthy": frontend_healthy == "true",
        "status": frontend_status,
        "message": frontend_message,
    },
    "functions": {
        "healthy": functions_healthy == "true",
        "status": functions_status,
        "message": functions_message,
    },
    "logs": {
        "watchdog": watchdog_log,
        "frontend": frontend_log,
        "functions": backend_log,
    },
}

with open(status_file, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2)
PY
}

trigger_recovery() {
  : > "$RECOVERY_RUNTIME_LOG"
  "$LAUNCHCTL_BIN" remove "$RECOVERY_LABEL" >/dev/null 2>&1 || true
  "$LAUNCHCTL_BIN" submit \
    -l "$RECOVERY_LABEL" \
    -o "$RECOVERY_RUNTIME_LOG" \
    -e "$RECOVERY_RUNTIME_LOG" \
    -- /bin/zsh -lc "export PATH=${(q)PATH} APP_DIR=${(q)APP_DIR}; cd ${(q)RUNTIME_DIR}; exec /bin/zsh ${(q)LAUNCHER}"
}

if [ -z "$CURL_BIN" ] || [ -z "$PYTHON_BIN" ] || [ -z "$LAUNCHCTL_BIN" ]; then
  log_watchdog "curl, python3, and launchctl are required for the watchdog."
  exit 1
fi

if [ ! -x "$LAUNCHER" ]; then
  log_watchdog "Canonical launcher is missing or not executable: $LAUNCHER"
  exit 1
fi

log_watchdog "Watchdog started with interval ${WATCHDOG_INTERVAL_SECONDS}s."

while true; do
  local_frontend_healthy="false"
  local_frontend_status="unknown"
  local_frontend_message="No frontend check has run yet."
  local_functions_healthy="false"
  local_functions_status="unknown"
  local_functions_message="No functions check has run yet."
  current_restart_count="$(read_restart_count)"
  current_restart_count="${current_restart_count:-0}"

  frontend_check="$(check_frontend)"
  IFS=$'\t' read -r local_frontend_healthy local_frontend_status local_frontend_message <<< "$frontend_check"

  functions_check="$(check_functions)"
  IFS=$'\t' read -r local_functions_healthy local_functions_status local_functions_message <<< "$functions_check"

  if [ "$local_frontend_healthy" = "true" ] && [ "$local_functions_healthy" = "true" ]; then
    write_status "true" "Watchdog check passed." \
      "$local_frontend_healthy" "$local_frontend_status" "$local_frontend_message" \
      "$local_functions_healthy" "$local_functions_status" "$local_functions_message" \
      "$current_restart_count"
    sleep "$WATCHDOG_INTERVAL_SECONDS"
    continue
  fi

  failing_components=()
  if [ "$local_frontend_healthy" != "true" ]; then
    failing_components+=("frontend")
  fi
  if [ "$local_functions_healthy" != "true" ]; then
    failing_components+=("functions")
  fi

  restart_action="Restarting via canonical launcher because ${failing_components[*]} failed the health check."
  log_watchdog "$restart_action"
  current_restart_count="$(increment_restart_count)"

  write_status "false" "$restart_action" \
    "$local_frontend_healthy" "$local_frontend_status" "$local_frontend_message" \
    "$local_functions_healthy" "$local_functions_status" "$local_functions_message" \
    "$current_restart_count"

  trigger_recovery || log_watchdog "Failed to submit watchdog recovery job."
  sleep "$WATCHDOG_INTERVAL_SECONDS"
done
