#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/alvee/Desktop/blitz"
SERVER_DIR="$ROOT_DIR/server"
VENV_DIR="$SERVER_DIR/.venv"

echo "[dev] Starting BizPilot local environment..."

# Check if http-server is available
if ! command -v npx >/dev/null 2>&1; then
  echo "[dev] Installing Node.js dependencies..."
  npm install
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "[dev] Creating Python venv..."
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "[dev] Installing server requirements (if needed)..."
pip install -r "$SERVER_DIR/requirements.txt" >/dev/null

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "[dev] WARNING: ffmpeg not found. Please install: sudo apt-get install -y ffmpeg"
fi

echo "[dev] Launching voice server on :8000"
UVICORN_CMD="uvicorn app:app --host 0.0.0.0 --port 8000"
cd "$SERVER_DIR"
$UVICORN_CMD &
UVICORN_PID=$!

cd "$ROOT_DIR"
echo "[dev] Serving static app with CORS support at http://localhost:3000"
echo "[dev] This will resolve Firebase Storage CORS issues"
npx http-server . -p 3000 -c-1 --cors

echo "[dev] Shutting down background services..."
kill $UVICORN_PID >/dev/null 2>&1 || true
wait $UVICORN_PID 2>/dev/null || true
echo "[dev] Done."


