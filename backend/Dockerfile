# Family ID backend — FastAPI + SQLAlchemy, served by uvicorn.
# Build context: backend/  (e.g. `docker build -t familyid-backend backend/`)
FROM python:3.12-slim AS base

# libpq is needed at runtime by psycopg (binary wheel still links against it on some platforms);
# curl is only used by the container HEALTHCHECK.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh \
    && useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/uploads \
    && chown -R appuser:appuser /app

USER appuser

# Render (and most PaaS Docker runners) assign the listen port at run time via $PORT and route
# traffic to it; 8000 is only the documented local default; the entrypoint always binds to $PORT.
ENV PORT=8000
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
