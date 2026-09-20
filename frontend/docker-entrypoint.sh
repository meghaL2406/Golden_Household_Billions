#!/bin/sh
# Runs as one of nginx's own /docker-entrypoint.d/ scripts, before nginx starts.
# Writes /usr/share/nginx/html/env-config.js from the API_URL environment variable, so the same
# built image can be pointed at any backend (staging, production, a PR preview, ...) just by
# changing an environment variable and restarting the container, with no rebuild.
set -eu

: "${API_URL:=}"

cat > /usr/share/nginx/html/env-config.js <<JS
window.__ENV__ = {
  VITE_API_URL: "${API_URL}"
};
JS

echo "[entrypoint] wrote env-config.js with VITE_API_URL=${API_URL:-<empty>}"
