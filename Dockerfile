# Family ID — single-service image: the FastAPI backend serves both the REST API and the built
# React frontend from one process, on one port. One Render Web Service, one origin, no CORS to
# configure. Build context: repo root (e.g. `docker build -t familyid .`).
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
FROM python:3.12-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libpq5 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=frontend-build /frontend/dist ./web
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
