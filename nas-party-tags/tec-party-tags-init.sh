#!/bin/sh
set -eu

BASE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PID_FILE="$BASE_DIR/tec-party-tags.pid"
LOG_DIR="$BASE_DIR/logs"
LOG_FILE="$LOG_DIR/tec-party-tags.log"
PYTHON_BIN="${PYTHON_BIN:-/opt/bin/python3}"
NOHUP_BIN="${NOHUP_BIN:-/opt/bin/nohup}"

export PARTY_TAGS_HOST="${PARTY_TAGS_HOST:-127.0.0.1}"
export PARTY_TAGS_PORT="${PARTY_TAGS_PORT:-8005}"
export PARTY_TAGS_DB="${PARTY_TAGS_DB:-$BASE_DIR/party_tags.sqlite3}"
export PARTY_TAGS_SEED="${PARTY_TAGS_SEED:-$BASE_DIR/party_tags_seed.json}"
export PARTY_TAGS_ALLOWED_ORIGINS="${PARTY_TAGS_ALLOWED_ORIGINS:-https://tec.joshuaru.sh,http://localhost:4321,http://127.0.0.1:4321}"

mkdir -p "$LOG_DIR"

is_running() {
  [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
  if is_running; then
    echo "tec-party-tags already running with PID $(cat "$PID_FILE")"
    exit 0
  fi

  cd "$BASE_DIR"
  "$NOHUP_BIN" "$PYTHON_BIN" "$BASE_DIR/server.py" >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "tec-party-tags started with PID $(cat "$PID_FILE") on ${PARTY_TAGS_HOST}:${PARTY_TAGS_PORT}"
}

stop() {
  if is_running; then
    kill "$(cat "$PID_FILE")"
    rm -f "$PID_FILE"
    echo "tec-party-tags stopped"
  else
    rm -f "$PID_FILE"
    echo "tec-party-tags is not running"
  fi
}

status() {
  if is_running; then
    echo "tec-party-tags running with PID $(cat "$PID_FILE") on ${PARTY_TAGS_HOST}:${PARTY_TAGS_PORT}"
  else
    echo "tec-party-tags is not running"
    exit 1
  fi
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *)
    echo "Usage: $0 {start|stop|restart|status}"
    exit 2
    ;;
esac
