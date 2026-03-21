#!/bin/zsh

set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")" && pwd)}"
SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
LOG_DIR="$APP_DIR/logs"
RUNTIME_DIR="$HOME/.codex/tmp/ai-mission-control-runtime"
PUBLIC_RUNTIME_DIR="$APP_DIR/public/runtime"
WATCHDOG_STATUS_FILE="$RUNTIME_DIR/watchdog-status.json"
PUBLIC_WATCHDOG_STATUS_LINK="$PUBLIC_RUNTIME_DIR/watchdog-status.json"
LAUNCHER_MIRROR="$RUNTIME_DIR/start-or-restart-app.command"
FRONTEND_PID_FILE="$LOG_DIR/app-frontend.pid"
FUNCTIONS_PID_FILE="$LOG_DIR/app-functions.pid"
WATCHDOG_PID_FILE="$LOG_DIR/app-watchdog.pid"
FRONTEND_LOG_FILE="$LOG_DIR/app-frontend.log"
BACKEND_LOG_FILE="$LOG_DIR/app-backend.log"
FRONTEND_RUNTIME_LOG="$RUNTIME_DIR/frontend-runtime.log"
FUNCTIONS_RUNTIME_LOG="$RUNTIME_DIR/functions-runtime.log"
WATCHDOG_RUNTIME_LOG="$RUNTIME_DIR/watchdog-runtime.log"
WATCHDOG_LOG_FILE="$RUNTIME_DIR/watchdog-events.log"
HOST="127.0.0.1"
PORT="8080"
SUPABASE_URL="http://127.0.0.1:54321"
SUPABASE_STATUS_TIMEOUT=60
DOCKER_TIMEOUT=90
PROCESS_PID_TIMEOUT=10
FRONTEND_LABEL="com.codex.ai-mission-control.frontend"
FUNCTIONS_LABEL="com.codex.ai-mission-control.functions"
WATCHDOG_LABEL="com.codex.ai-mission-control.watchdog"
USER_ID="$(id -u)"
USER_NAME="$(id -un)"
WATCHDOG_INTERVAL_SECONDS="${WATCHDOG_INTERVAL_SECONDS:-300}"

NODE_BIN="$(command -v node || true)"
NPX_BIN="$(command -v npx || true)"
DOCKER_BIN="$(command -v docker || true)"
LAUNCHCTL_BIN="$(command -v launchctl || true)"
CURL_BIN="$(command -v curl || true)"
OPEN_BIN="$(command -v open || true)"
PYTHON_BIN="$(command -v python3 || true)"
VITE_JS="$APP_DIR/node_modules/vite/bin/vite.js"
WATCHDOG_SCRIPT="$APP_DIR/scripts/runtime-watchdog.sh"
WATCHDOG_LAUNCH_SCRIPT="$RUNTIME_DIR/runtime-watchdog.sh"

mkdir -p "$LOG_DIR" "$RUNTIME_DIR"
cd "$APP_DIR"

PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' "$APP_DIR/supabase/config.toml" | head -n 1)"
SUPABASE_NETWORK="supabase_network_${PROJECT_ID}"
FRONTEND_PATTERN="$APP_DIR/node_modules/vite/bin/vite.js --host $HOST --port $PORT"
FUNCTIONS_PATTERN="supabase functions serve --env-file .env --no-verify-jwt --network-id $SUPABASE_NETWORK"
WATCHDOG_PATTERN="runtime-watchdog.sh"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log_to() {
  local file="$1"
  shift
  printf '[%s] %s\n' "$(timestamp)" "$*" >> "$file"
}

log_frontend() {
  log_to "$FRONTEND_LOG_FILE" "$@"
}

log_backend() {
  log_to "$BACKEND_LOG_FILE" "$@"
}

log_both() {
  log_frontend "$@"
  log_backend "$@"
}

require_command() {
  local label="$1"
  local value="$2"

  if [ -n "$value" ]; then
    return 0
  fi

  : > "$FRONTEND_LOG_FILE"
  : > "$BACKEND_LOG_FILE"
  log_both "$label was not found on PATH."
  exit 1
}

stop_pid() {
  local pid="$1"
  local waited=0

  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi

  pkill -TERM -P "$pid" 2>/dev/null || true
  kill -TERM "$pid" 2>/dev/null || true

  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 10 ]; do
    sleep 1
    waited=$((waited + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    pkill -KILL -P "$pid" 2>/dev/null || true
    kill -KILL "$pid" 2>/dev/null || true
  fi
}

stop_pid_file() {
  local pid_file="$1"
  local label="$2"

  if [ ! -f "$pid_file" ]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [ -n "${pid:-}" ]; then
    log_both "Stopping previous $label PID from PID file: $pid"
    stop_pid "$pid"
  fi

  rm -f "$pid_file"
}

find_matching_pids() {
  pgrep -f "$1" || true
}

first_matching_pid() {
  pgrep -f "$1" | head -n 1 || true
}

wait_for_process_pid() {
  local pattern="$1"
  local waited=0
  local pid=""

  while [ "$waited" -lt "$PROCESS_PID_TIMEOUT" ]; do
    pid="$(first_matching_pid "$pattern")"
    if [ -n "$pid" ]; then
      printf '%s\n' "$pid"
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  return 1
}

remove_job() {
  "$LAUNCHCTL_BIN" remove "$1" >/dev/null 2>&1 || true
}

cleanup_legacy_launchagents() {
  "$LAUNCHCTL_BIN" bootout "gui/$USER_ID" "$HOME/Library/LaunchAgents/com.codex.ai-mission-control.functions.plist" >/dev/null 2>&1 || true
  "$LAUNCHCTL_BIN" bootout "gui/$USER_ID" "$HOME/Library/LaunchAgents/com.codex.ai-mission-control.frontend.plist" >/dev/null 2>&1 || true
  rm -f "$HOME/Library/LaunchAgents/com.codex.ai-mission-control.functions.plist" >/dev/null 2>&1 || true
  rm -f "$HOME/Library/LaunchAgents/com.codex.ai-mission-control.frontend.plist" >/dev/null 2>&1 || true
}

stop_matching_processes() {
  local pattern="$1"
  local label="$2"
  local pid=""

  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    log_both "Stopping existing $label PID: $pid"
    stop_pid "$pid"
  done <<EOF
$(find_matching_pids "$pattern")
EOF
}

submit_job() {
  local label="$1"
  local runtime_log="$2"
  local command="$3"

  remove_job "$label"
  : > "$runtime_log"
  "$LAUNCHCTL_BIN" submit -l "$label" -o "$runtime_log" -e "$runtime_log" -- /bin/zsh -c "$command"
}

sync_runtime_scripts() {
  cp "$SCRIPT_PATH" "$LAUNCHER_MIRROR"
  if [ -r "$WATCHDOG_SCRIPT" ]; then
    cp "$WATCHDOG_SCRIPT" "$WATCHDOG_LAUNCH_SCRIPT"
  fi
  chmod +x "$LAUNCHER_MIRROR" "$WATCHDOG_LAUNCH_SCRIPT"
}

prepare_runtime_status_link() {
  mkdir -p "$PUBLIC_RUNTIME_DIR"
  rm -f "$PUBLIC_WATCHDOG_STATUS_LINK"
  ln -s "$WATCHDOG_STATUS_FILE" "$PUBLIC_WATCHDOG_STATUS_LINK"
}

wait_for_docker() {
  local waited=0

  while [ "$waited" -lt "$DOCKER_TIMEOUT" ]; do
    if "$DOCKER_BIN" info >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done

  return 1
}

ensure_docker() {
  if "$DOCKER_BIN" info >/dev/null 2>&1; then
    log_backend "Docker daemon already running."
    return 0
  fi

  log_backend "Docker daemon is not running. Launching Docker Desktop."
  "$OPEN_BIN" -g -a Docker >/dev/null 2>&1 || true

  if wait_for_docker; then
    log_backend "Docker daemon is ready."
    return 0
  fi

  log_backend "Docker did not become ready in time."
  exit 1
}

wait_for_supabase() {
  local waited=0

  while [ "$waited" -lt "$SUPABASE_STATUS_TIMEOUT" ]; do
    if "$NODE_BIN" "$NPX_BIN" supabase status >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    waited=$((waited + 2))
  done

  return 1
}

ensure_supabase_stack() {
  if "$NODE_BIN" "$NPX_BIN" supabase status >/dev/null 2>&1; then
    log_backend "Supabase stack already running."
    return 0
  fi

  log_backend "Starting local Supabase stack."
  "$NODE_BIN" "$NPX_BIN" supabase start >> "$BACKEND_LOG_FILE" 2>&1 || true

  if wait_for_supabase; then
    log_backend "Supabase stack is ready at $SUPABASE_URL."
    return 0
  fi

  log_backend "Supabase stack did not become ready in time."
  exit 1
}

wait_for_functions_gateway() {
  local waited=0
  local response=""

  while [ "$waited" -lt 30 ]; do
    response="$("$CURL_BIN" -s --max-time 3 "$SUPABASE_URL/functions/v1/chat" || true)"
    if [[ "$response" != *"name resolution failed"* ]] && [ -n "$response" ]; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  return 1
}

wait_for_frontend_http() {
  local waited=0
  local status_line=""

  while [ "$waited" -lt 30 ]; do
    status_line="$("$CURL_BIN" -sI --max-time 3 "http://$HOST:$PORT" | head -n 1 || true)"
    if [[ "$status_line" == *"200"* ]]; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done

  return 1
}

start_functions() {
  local command
  local functions_pid=""

  stop_pid_file "$FUNCTIONS_PID_FILE" "functions runtime"
  stop_matching_processes "$FUNCTIONS_PATTERN" "functions runtime"
  : > "$BACKEND_LOG_FILE"
  log_backend "Starting local Edge Functions runtime via launchctl submit."

  command="export HOME=${(q)HOME} USER=${(q)USER_NAME} PATH=${(q)PATH}; cd ${(q)APP_DIR}; exec ${(q)NODE_BIN} ${(q)NPX_BIN} supabase functions serve --env-file .env --no-verify-jwt --network-id ${(q)SUPABASE_NETWORK}"
  submit_job "$FUNCTIONS_LABEL" "$FUNCTIONS_RUNTIME_LOG" "$command"

  if ! wait_for_functions_gateway; then
    log_backend "Edge Functions runtime did not become reachable at $SUPABASE_URL/functions/v1/chat. See $FUNCTIONS_RUNTIME_LOG."
    exit 1
  fi

  functions_pid="$(wait_for_process_pid "$FUNCTIONS_PATTERN" || true)"
  if [ -n "$functions_pid" ]; then
    echo "$functions_pid" > "$FUNCTIONS_PID_FILE"
    log_backend "Edge Functions runtime is reachable at $SUPABASE_URL/functions/v1/chat with PID $functions_pid. Runtime log: $FUNCTIONS_RUNTIME_LOG"
  else
    rm -f "$FUNCTIONS_PID_FILE"
    log_backend "Edge Functions runtime is reachable at $SUPABASE_URL/functions/v1/chat. Runtime log: $FUNCTIONS_RUNTIME_LOG"
  fi
}

start_frontend() {
  local command
  local frontend_pid=""

  stop_pid_file "$FRONTEND_PID_FILE" "frontend"
  stop_matching_processes "$FRONTEND_PATTERN" "frontend"
  : > "$FRONTEND_LOG_FILE"
  log_frontend "Starting frontend via launchctl submit."

  command="export HOME=${(q)HOME} USER=${(q)USER_NAME} PATH=${(q)PATH}; cd ${(q)APP_DIR}; exec ${(q)NODE_BIN} ${(q)VITE_JS} --host ${(q)HOST} --port ${(q)PORT}"
  submit_job "$FRONTEND_LABEL" "$FRONTEND_RUNTIME_LOG" "$command"

  if ! wait_for_frontend_http; then
    log_frontend "Frontend did not become reachable at http://$HOST:$PORT. See $FRONTEND_RUNTIME_LOG."
    exit 1
  fi

  frontend_pid="$(wait_for_process_pid "$FRONTEND_PATTERN" || true)"
  if [ -n "$frontend_pid" ]; then
    echo "$frontend_pid" > "$FRONTEND_PID_FILE"
    log_frontend "Frontend started on http://$HOST:$PORT with PID $frontend_pid. Runtime log: $FRONTEND_RUNTIME_LOG"
  else
    rm -f "$FRONTEND_PID_FILE"
    log_frontend "Frontend started on http://$HOST:$PORT. Runtime log: $FRONTEND_RUNTIME_LOG"
  fi
}

start_watchdog() {
  local command
  local watchdog_pid=""

  if [ ! -x "$WATCHDOG_LAUNCH_SCRIPT" ]; then
    log_backend "Watchdog launch script is missing or not executable: $WATCHDOG_LAUNCH_SCRIPT"
    exit 1
  fi

  stop_pid_file "$WATCHDOG_PID_FILE" "watchdog"
  stop_matching_processes "$WATCHDOG_PATTERN" "watchdog"
  : > "$WATCHDOG_LOG_FILE"
  log_backend "Starting local runtime watchdog via launchctl submit."

  command="export HOME=${(q)HOME} USER=${(q)USER_NAME} PATH=${(q)PATH} APP_DIR=${(q)APP_DIR} LAUNCHER=${(q)LAUNCHER_MIRROR} WATCHDOG_INTERVAL_SECONDS=${(q)WATCHDOG_INTERVAL_SECONDS}; cd ${(q)RUNTIME_DIR}; exec /bin/zsh ./runtime-watchdog.sh"
  submit_job "$WATCHDOG_LABEL" "$WATCHDOG_RUNTIME_LOG" "$command"

  watchdog_pid="$(wait_for_process_pid "$WATCHDOG_PATTERN" || true)"
  if [ -n "$watchdog_pid" ]; then
    echo "$watchdog_pid" > "$WATCHDOG_PID_FILE"
    log_backend "Local runtime watchdog started with PID $watchdog_pid. Runtime log: $WATCHDOG_RUNTIME_LOG"
  else
    rm -f "$WATCHDOG_PID_FILE"
    log_backend "Local runtime watchdog submitted. Runtime log: $WATCHDOG_RUNTIME_LOG"
  fi
}

require_command "node" "$NODE_BIN"
require_command "npx" "$NPX_BIN"
require_command "docker" "$DOCKER_BIN"
require_command "launchctl" "$LAUNCHCTL_BIN"
require_command "curl" "$CURL_BIN"
require_command "open" "$OPEN_BIN"
require_command "python3" "$PYTHON_BIN"

if [ ! -f "$APP_DIR/supabase/config.toml" ]; then
  : > "$FRONTEND_LOG_FILE"
  : > "$BACKEND_LOG_FILE"
  log_both "supabase/config.toml is missing."
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  : > "$FRONTEND_LOG_FILE"
  : > "$BACKEND_LOG_FILE"
  log_both "Could not determine the Supabase project_id from supabase/config.toml."
  exit 1
fi

if [ ! -f "$VITE_JS" ]; then
  : > "$FRONTEND_LOG_FILE"
  : > "$BACKEND_LOG_FILE"
  log_both "Vite is not installed. Run npm install first."
  exit 1
fi

: > "$FRONTEND_LOG_FILE"
: > "$BACKEND_LOG_FILE"
log_both "Launcher started."

cleanup_legacy_launchagents
stop_pid_file "$WATCHDOG_PID_FILE" "watchdog"
stop_matching_processes "$WATCHDOG_PATTERN" "watchdog"
sync_runtime_scripts
prepare_runtime_status_link
ensure_docker
ensure_supabase_stack
start_functions
start_frontend
start_watchdog

exit 0
