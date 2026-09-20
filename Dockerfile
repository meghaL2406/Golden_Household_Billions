# Family ID — single-service image: the FastAPI backend serves both the REST API and the built
# React frontend from one process on one port, and can run its own embedded PostgreSQL when no
# external database is configured. Add this repository to Render as a Docker Web Service with no
# environment variables and it comes up with a seeded demo; give it DATABASE_URL (render.yaml does)
# and it uses managed Postgres instead. Build context: repo root.
#
# For two independently-scalable services instead, see backend/Dockerfile and frontend/Dockerfile,
# and DEPLOY.md "Option B".

# ---------------------------------------------------------------- stage 1: build the frontend
FROM node:20-alpine AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ .
# Same origin as the API it is served from — no backend URL to know about at build time.
RUN echo "VITE_API_URL=" > .env.production
RUN npm run build

# ---------------------------------------------------------------- stage 2: backend + serve the build
# Pinned to a Debian release so the PostgreSQL package version below stays valid.
FROM python:3.12-slim-trixie

# postgresql-17: embedded database used only when DATABASE_URL is not provided (pg_trgm is included).
# libpq5 for psycopg; curl for the HEALTHCHECK.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libpq5 postgresql-17 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /frontend/dist ./web
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data/pgdata /app/data/uploads \
    && rm -rf /app/uploads && ln -s /app/data/uploads /app/uploads \
    && chown -R appuser:appuser /app

# The entrypoint starts as root only to fix ownership of a mounted /app/data, then drops to appuser.
ENV PORT=8000 \
    WEB_CONCURRENCY=2 \
    DATA_DIR=/app/data \
    PGDATA=/app/data/pgdata \
    PG_BIN=/usr/lib/postgresql/17/bin \
    SEED_ON_BOOT=true \
    PYTHONUNBUFFERED=1

VOLUME ["/app/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
