#!/usr/bin/env sh
# Entrypoint for the backend container. Tables and extensions are created by the FastAPI lifespan
# hook on startup (app.core.database.init_extensions / Base.metadata.create_all), so no separate
# migration step is required here.
#
# Set SEED_ON_BOOT=true to load the demo dataset on first boot (skipped automatically once the
# database already has users — see app/seed.py). Never set SEED_RESET=true against a database you
# care about: it drops every table first.
set -eu

if [ "${SEED_ON_BOOT:-false}" = "true" ]; then
  echo "[entrypoint] SEED_ON_BOOT is set; running app.seed"
  if [ "${SEED_RESET:-false}" = "true" ]; then
    python -m app.seed --reset
  else
    python -m app.seed
  fi
fi

echo "[entrypoint] starting uvicorn on 0.0.0.0:${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --proxy-headers
