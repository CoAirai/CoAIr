#!/bin/bash
# Container entrypoint. The image serves one thing: the FastAPI backend, which
# also serves the built React SPA from frontend/dist.
set -e

PORT="${PORT:-8080}"

echo "Starting COAir API on port $PORT..."
exec uvicorn backend.main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers 1
