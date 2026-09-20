# Family ID frontend — static Vite build served by nginx.
# Build context: frontend/  (e.g. `docker build -t familyid-frontend frontend/`)

# ---------------------------------------------------------------- build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# ---------------------------------------------------------------- runtime stage
FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.d/50-familyid-env-config.sh
RUN chmod +x /docker-entrypoint.d/50-familyid-env-config.sh

# The official nginx image already envsubst's *.template files in /etc/nginx/templates into
# /etc/nginx/conf.d on start, and runs every executable script in /docker-entrypoint.d/ before
# nginx itself starts — no custom ENTRYPOINT/CMD needed, which keeps the image's built-in signal
# handling and non-root worker setup intact.

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1
