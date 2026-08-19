"""FastAPI-specific configuration."""

import os

# Server
API_HOST = os.getenv("API_HOST", "0.0.0.0")
API_PORT = int(os.getenv("API_PORT", "8000"))

# CORS
#
# Production serves the SPA from this same process, so the browser never makes a
# cross-origin call and the defaults below only cover local `npm run dev`. A
# separately hosted client (e.g. an external admin panel) needs its own origin
# listed here via the comma-separated CORS_ORIGINS env var.
#
# `allow_credentials=True` in backend/main.py means "*" is rejected by the
# browser anyway — every origin must be spelled out in full, scheme included.
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3002",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
] or _DEFAULT_CORS_ORIGINS

# Auth (placeholder for future)
API_KEY = os.getenv("API_KEY", "")
