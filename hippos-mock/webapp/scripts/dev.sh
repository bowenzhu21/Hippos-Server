#!/usr/bin/env bash
set -euo pipefail

# Resolve important paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBAPP_DIR="$SCRIPT_DIR/../hippos"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
LISTENER="$SCRIPT_DIR/../../listener.py"
GENERATOR="$SCRIPT_DIR/../../ml_stub.py"
VENV_ACTIVATE="$REPO_ROOT/.venv/bin/activate"

# Activate Python venv if present
if [ -f "$VENV_ACTIVATE" ]; then
  # shellcheck source=/dev/null
  source "$VENV_ACTIVATE"
fi

# Choose python binary
PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

echo "[dev] Starting Flask mock API (listener.py)..."
"$PYTHON_BIN" "$LISTENER" &
FLASK_PID=$!

echo "[dev] Starting Python generator (ml_stub.py) for continuous streaming..."
HIPPOS_GEN_PERIOD_SEC="${HIPPOS_GEN_PERIOD_SEC:-0.5}" "$PYTHON_BIN" "$GENERATOR" &
GEN_PID=$!

echo "[dev] Configuring frontend to ingest to local tunnel..."
# Expect an SSH tunnel or VS Code port forward: localhost:8000 -> VPS:127.0.0.1:8000
export EXPO_PUBLIC_HIPPOS_API_BASE="http://localhost:8000"
export EXPO_PUBLIC_HIPPOS_API_KEY="hippos_dev_key_123"
export HIPPOS_FASTAPI_BASE="http://localhost:8000"
export HIPPOS_FASTAPI_KEY="hippos_dev_key_123"
echo "[dev] Ingest target (Expo): $EXPO_PUBLIC_HIPPOS_API_BASE"
echo "[dev] Ingest target (Flask forward): $HIPPOS_FASTAPI_BASE"

echo "[dev] Starting Expo dev server (interactive)..."
cd "$WEBAPP_DIR"
# Run Expo in the foreground so TTY keybindings (i/a/w) work
npm run start

cleanup() {
  echo
  echo "[dev] Shutting down background processes..."
  kill "$FLASK_PID" 2>/dev/null || true
  wait "$FLASK_PID" 2>/dev/null || true
  kill "$GEN_PID" 2>/dev/null || true
  wait "$GEN_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# When Expo exits (or Ctrl+C), trap will clean up Flask
