#!/usr/bin/env sh
# Starts both dev servers through the portless proxy in parallel.
# Run from the repo root: bun run dev
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_OUTPUT_DIR="$REPO_ROOT/outputs"
mkdir -p "$SHARED_OUTPUT_DIR"

portless gateway sh -c "cd gateway && WORKER_BASE_URL=\$(portless get worker) OUTPUT_DIR=$SHARED_OUTPUT_DIR bun run dev" &
GATEWAY_PID=$!

portless worker sh -c "cd worker && GATEWAY_CALLBACK_URL=\$(portless get gateway) OUTPUT_DIR=$SHARED_OUTPUT_DIR uv run uvicorn parallax_worker.main:app --host \"\${HOST:-0.0.0.0}\" --port \"\${PORT:-8000}\" --reload" &
WORKER_PID=$!

trap 'kill "$GATEWAY_PID" "$WORKER_PID" 2>/dev/null; exit 0' INT TERM
wait
