#!/usr/bin/env bash
# Inspector RCA Service — development runner with full debug logging.
# Usage: ./run.sh [--port PORT]
#
# LOG_LEVEL=DEBUG enables all log levels (DEBUG, INFO, WARNING, ERROR, CRITICAL)
# and is written to both the console and logs/DD-MM-YYYY.log.

set -euo pipefail

PORT="${PORT:-8000}"

# Parse optional --port argument
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

# Activate venv if present
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/venv/bin/activate" ]]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/venv/bin/activate"
fi

cd "$SCRIPT_DIR"

echo "Starting rca_service on port $PORT with LOG_LEVEL=DEBUG ..."

LOG_LEVEL=DEBUG uvicorn app:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --reload \
  --log-level debug
