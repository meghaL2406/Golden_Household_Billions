#!/usr/bin/env sh
# Entrypoint for the single-service image (API + built frontend, optional embedded PostgreSQL).
#
# Zero-configuration contract: with NO environment variables at all this container comes up with a
# working demo — an embedded PostgreSQL in $DATA_DIR/pgdata, a generated JWT secret, and the demo
# dataset. Provide DATABASE_URL (for example from Render's managed Postgres via render.yaml) and the
# embedded database is not started at all.
#
#   DATABASE_URL     external Postgres; if empty an embedded server is started on 127.0.0.1:5432
#   DATA_DIR         persistent root (default /app/data): pgdata/, uploads/, jwt_secret, postgres.log.
#                    Mount a Render Disk here to keep data across deploys and restarts.
#   JWT_SECRET       if empty or "change-me", one is generated once and kept in $DATA_DIR/jwt_secret
#   SEED_ON_BOOT     "true" (image default) loads the demo dataset when the database has no users
#   SEED_RESET       "true" drops every table first — never on data you care about
#   PORT             listen port (Render sets it); WEB_CONCURRENCY uvicorn workers (default 2)
set -eu

DATA_DIR="${DATA_DIR:-/app/data}"
PGDATA="${PGDATA:-$DATA_DIR/pgdata}"
# Resolve the PostgreSQL binaries even if the packaged major version changes.
if [ -z "${PG_BIN:-}" ] || [ ! -x "${PG_BIN}/pg_ctl" ]; then
  PG_BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
fi
APP_USER="appuser"
APP_UID="10001"

log() { echo "[entrypoint] $*"; }

# ---------------------------------------------------------------- 1. drop root
# The image starts as root only so that a platform-mounted volume (often root-owned) can be handed
# to the application user; PostgreSQL refuses to run as root, and nothing here needs it.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/uploads" "$PGDATA"
  if [ "$(stat -c %u "$DATA_DIR")" != "$APP_UID" ]; then
    chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
  fi
  chown "$APP_USER:$APP_USER" /app 2>/dev/null || true
  # setpriv exec's in place (no intermediate parent process), so this shell stays PID 1 and its
  # signal trap below produces a clean exit code on SIGTERM.
  export HOME="/home/$APP_USER"
  exec setpriv --reuid="$APP_UID" --regid="$APP_UID" --init-groups -- "$0" "$@"
fi

# Uploads live on the persistent data dir; the application writes to /app/uploads.
mkdir -p "$DATA_DIR/uploads"
if [ ! -L /app/uploads ]; then
  rm -rf /app/uploads
  ln -s "$DATA_DIR/uploads" /app/uploads
fi

# ---------------------------------------------------------------- 2. database
EMBEDDED=""
if [ -z "${DATABASE_URL:-}" ]; then
  EMBEDDED="1"
  log "DATABASE_URL is not set: starting the embedded PostgreSQL in $PGDATA"
  log "NOTE: without a disk mounted at $DATA_DIR this data is lost on every deploy or restart."
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    "$PG_BIN/initdb" -D "$PGDATA" -U familyid --auth=trust --encoding=UTF8 --locale=C.UTF-8 >/dev/null
  fi
  rm -f "$PGDATA/postmaster.pid.stale" 2>/dev/null || true
  "$PG_BIN/pg_ctl" -D "$PGDATA" -l "$DATA_DIR/postgres.log" -w -t 90 \
    -o "-c listen_addresses=127.0.0.1 -p 5432 -k /tmp -c shared_buffers=64MB -c max_connections=50" start
  if ! "$PG_BIN/psql" -h 127.0.0.1 -U familyid -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='familyid'" | grep -q 1; then
    "$PG_BIN/createdb" -h 127.0.0.1 -U familyid familyid
  fi
  export DATABASE_URL="postgresql+psycopg://familyid@127.0.0.1:5432/familyid"
else
  log "using external database from DATABASE_URL"
fi

# ---------------------------------------------------------------- 3. secret
if [ -z "${JWT_SECRET:-}" ] || [ "${JWT_SECRET:-}" = "change-me" ]; then
  if [ ! -s "$DATA_DIR/jwt_secret" ]; then
    python -c 'import secrets; print(secrets.token_urlsafe(48))' > "$DATA_DIR/jwt_secret"
    chmod 600 "$DATA_DIR/jwt_secret"
    log "generated a JWT secret in $DATA_DIR/jwt_secret"
  fi
  JWT_SECRET="$(cat "$DATA_DIR/jwt_secret")"
  export JWT_SECRET
fi

# ---------------------------------------------------------------- 4. demo data
if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  if [ "${SEED_RESET:-false}" = "true" ]; then
    log "SEED_RESET=true: dropping and reseeding the database"
    python -m app.seed --reset
  else
    log "seeding the demo dataset if the database is empty"
    python -m app.seed
  fi
fi

# ---------------------------------------------------------------- 5. serve
stop_all() {
  log "shutting down"
  [ -n "${UV_PID:-}" ] && kill -TERM "$UV_PID" 2>/dev/null || true
  [ -n "${UV_PID:-}" ] && wait "$UV_PID" 2>/dev/null || true
  [ -n "$EMBEDDED" ] && "$PG_BIN/pg_ctl" -D "$PGDATA" -m fast -w stop >/dev/null 2>&1 || true
}
trap 'stop_all; exit 0' TERM INT

log "starting uvicorn on 0.0.0.0:${PORT:-8000} (workers: ${WEB_CONCURRENCY:-2}), serving the built frontend from ./web"
uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --workers "${WEB_CONCURRENCY:-2}" --proxy-headers &
UV_PID=$!
wait "$UV_PID" || true
STATUS=$?
stop_all
exit "$STATUS"
