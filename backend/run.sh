#!/usr/bin/env bash
# Start the Family ID API with hot reload on http://localhost:8000 (docs at /docs).
set -euo pipefail
cd "$(dirname "$0")"
exec .venv/bin/uvicorn app.main:app --reload --port 8000
