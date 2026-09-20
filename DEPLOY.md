# Deploying to Render

Two Docker-based web services (backend, frontend) plus a managed Postgres database. Either use the
`render.yaml` blueprint for a mostly one-click setup, or create the three resources by hand — both are
covered below. Read [Networking notes](#networking-notes) either way; it explains the two environment
variables that cannot be filled in until both services exist.

## Option A — Blueprint (`render.yaml`)

1. Push this repository to GitHub or GitLab.
2. In the Render dashboard: **New → Blueprint**, point it at the repository. Render reads
   [`render.yaml`](render.yaml) and proposes a Postgres database, `familyid-backend` and
   `familyid-frontend`.
3. Apply it. The first deploy will succeed for the backend (it only needs `DATABASE_URL`, which
   Render fills in automatically from the database) but the frontend will come up without a working
   `API_URL`, and the backend will reject the frontend's requests until `CORS_ORIGINS` is set — see
   [Networking notes](#networking-notes) to finish the wiring.

## Option B — Manual setup

### 1. Database

**New → PostgreSQL.** Name it `familyid-db`, note the **Internal Database URL** once it is
provisioned — the backend should use the internal URL (same-region traffic, no extra cost or
latency), not the external one.

### 2. Backend service

**New → Web Service → Build and deploy from a Git repository.**

| Setting | Value |
|---|---|
| Runtime | Docker |
| Dockerfile path | `backend/Dockerfile` |
| Docker build context directory | `backend` |
| Health check path | `/api/health` |

Environment variables — the fastest way is **Environment tab → Add Environment Variable → Add from
.env**, and paste in [`render-backend.env`](render-backend.env). Fix its three `REPLACE_ME` values
first: `DATABASE_URL` (the database's Internal Database URL from step 1), `JWT_SECRET` (any long random
string), and `CORS_ORIGINS` (leave as a placeholder for now — it needs the frontend's URL from step 4,
which does not exist yet). Everything else in that file already has a working default; see
[`backend/README.md`](backend/README.md) for what each one does.

Deploy. Once it is live, copy its public URL (`https://familyid-backend-xxxx.onrender.com`).

### 3. Frontend service

**New → Web Service → Build and deploy from a Git repository**, same repo.

| Setting | Value |
|---|---|
| Runtime | Docker |
| Dockerfile path | `frontend/Dockerfile` |
| Docker build context directory | `frontend` |

Environment variable — paste [`render-frontend.env`](render-frontend.env) via **Add from .env** and
replace its one placeholder:

| Key | Value |
|---|---|
| `API_URL` | the backend URL from step 2, e.g. `https://familyid-backend-xxxx.onrender.com` |

Deploy. Copy its public URL too (`https://familyid-frontend-xxxx.onrender.com`).

### 4. Close the loop: CORS

Go back to the **backend** service, set `CORS_ORIGINS` to the frontend's URL from step 3 (comma-separate
more than one origin, e.g. a custom domain as well), and redeploy. Until this is set, the browser will
show CORS errors and no request will succeed even though both services are individually healthy.

## Networking notes

- **Why two variables can't be pre-filled:** Render assigns each service's `*.onrender.com` hostname
  only after it is first created, so `CORS_ORIGINS` (backend needs the frontend's URL) and `API_URL`
  (frontend needs the backend's URL) are circular on a first deploy. Fill them in once, after both
  services exist — see step 4 above. Every deploy after that is automatic.
- **How the frontend finds the API:** the browser calls the backend directly — the frontend is a static
  build served by nginx, with **no server-side proxy** to the backend. `API_URL` is written into
  `env-config.js` by [`frontend/docker-entrypoint.sh`](frontend/docker-entrypoint.sh) when the container
  starts, and read at runtime by [`frontend/src/lib/api.ts`](frontend/src/lib/api.ts). This means the
  same built Docker image works in any environment — change `API_URL` and restart, no rebuild needed.
- **Port binding:** Render assigns the container's listen port via the `PORT` environment variable at
  run time (not necessarily 8000/8080). Both Dockerfiles already honour this — the backend's
  `docker-entrypoint.sh` passes `--port "$PORT"` to uvicorn, and the frontend's nginx config is
  templated with `${PORT}` and rendered at container start.
- **Database URL scheme:** Render (and most managed Postgres providers) hand out a `postgres://` or
  `postgresql://` connection string. `backend/app/core/config.py` normalises this to the
  `postgresql+psycopg://` scheme SQLAlchemy needs automatically — no manual edit required.
- **PostGIS:** the backend tries to enable the `postgis` extension at start-up but does not require it
  (`app/core/database.py: init_extensions`); Render's managed Postgres may not offer it, and the app
  falls back to plain latitude/longitude columns on the map without any code change.

## Uploaded documents and the ephemeral filesystem

Render's Docker services use an ephemeral filesystem: anything written locally (including
`backend/uploads/` when Cloudinary is not configured) is lost on every redeploy or restart. For a real
deployment, set the three `CLOUDINARY_*` environment variables on the backend so documents are stored
durably instead. For a short-lived demo, local storage is fine as-is.

## Loading demo data

Set `SEED_ON_BOOT=true` on the backend service and redeploy to load the standard demo dataset once,
the first time the database is empty (see [`backend/app/seed.py`](backend/app/seed.py)). Turn it back
off afterwards — leaving it on has no effect on a non-empty database, but it is not something to leave
set indefinitely. **Never** set `SEED_RESET=true` on a deployment with real data: it drops every table
first. To reset a deployed database deliberately, use Render's **Shell** tab on the backend service and
run `python -m app.seed --reset` by hand.

## Local Docker testing

Before pushing to Render, the same two Dockerfiles can be exercised together locally:

```bash
docker compose up --build
```

This starts Postgres, the backend and the frontend on one Docker network (see
[`docker-compose.yml`](docker-compose.yml)), seeded automatically, at http://localhost:8080 (frontend)
and http://localhost:8000/docs (backend).

## Alternative: frontend as a Render Static Site

The frontend Dockerfile is provided because it was asked for, but a plain **Static Site** (build command
`npm run build`, publish directory `dist`) is a simpler and cheaper option on Render for a build with no
server-side logic. In that case, set the `VITE_API_URL` build-time environment variable instead of the
Docker image's runtime `API_URL` — Vite bakes it into the bundle, so a URL change requires a rebuild.
