// Default runtime configuration for local development (`npm run dev`) and for the single-service
// Docker build (root Dockerfile). Deliberately does NOT set VITE_API_URL, so src/lib/api.ts falls
// through to the build-time value instead:
// - Local dev: frontend/.env sets VITE_API_URL=http://localhost:8000 (the backend's separate dev
//   server port).
// - Single-service Docker image: the root Dockerfile writes frontend/.env.production with
//   VITE_API_URL="" before building, which correctly resolves to "same origin" — the backend serves
//   this exact build itself, so there is nothing else to point at.
//
// The two-separate-services Docker image (frontend/Dockerfile) is the one case that DOES override
// this file at runtime: frontend/docker-entrypoint.sh rewrites it at container start with the
// backend's real URL from the API_URL environment variable, so that one built image can be pointed
// at any backend without a rebuild.
window.__ENV__ = {};
