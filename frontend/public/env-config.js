// Default runtime configuration for local development (`npm run dev` / `npm run build`).
// In the Docker image, docker-entrypoint.sh overwrites this file at container start from the
// API_URL environment variable, so the same built image can point at any backend without a rebuild.
window.__ENV__ = {
  VITE_API_URL: "",
};
