# Deploying to Render

The recommended layout is **one Web Service plus one managed Postgres database**. The root
[`Dockerfile`](Dockerfile) builds the React frontend and copies it into the FastAPI image, and the
backend serves both the API and the built frontend from one process on one port. Because everything is
on one origin there is no CORS to configure and no service URL to wire in after the fact.

An alternative two-service layout (separate backend and frontend containers) is kept in
[Option B](#option-b--two-separate-services) for when the two need to scale independently.

## Option A — single service (recommended)

### A1. Blueprint (`render.yaml`), one click

1. Push this repository to GitHub or GitLab.
2. Render dashboard: **New → Blueprint**, pick the repository. Render reads
   [`render.yaml`](render.yaml) and proposes the `familyid-db` database and the `familyid` web
   service.
3. Apply. `DATABASE_URL` is filled in from the database and `JWT_SECRET` is generated for you; every
   other variable already has a working default. The first boot loads the demo dataset
   (`SEED_ON_BOOT=true`); set it back to `false` afterwards.
4. Open the service URL (`https://familyid-xxxx.onrender.com`) and sign in with a demo login
   (OTP `123456`).

### A2. Manual setup, no blueprint

1. **Database.** **New → PostgreSQL**, name `familyid-db`. Once provisioned, copy its **Internal
   Database URL** (same region, no egress cost; not the external one).
2. **Web Service.** **New → Web Service → Build and deploy from a Git repository**, same repo.

   | Setting | Value |
   |---|---|
   | Runtime | Docker |
   | Dockerfile path | `Dockerfile` |
   | Docker build context directory | `.` (repository root) |
   | Health check path | `/api/health` |

3. **Environment.** Environment tab → **Add Environment Variable → Add from .env**, paste
   [`render.env`](render.env), and replace its two `REPLACE_ME` values: `DATABASE_URL` (from step 1)
   and `JWT_SECRET` (any long random string). See [`backend/README.md`](backend/README.md) for what
   each variable does.
4. **Deploy.** The first boot creates the tables and, with `SEED_ON_BOOT=true`, loads the demo
   dataset. Set `SEED_ON_BOOT` back to `false` once you have signed in.

### Test the same image locally first

```bash
docker compose up --build
```

That starts Postgres and the single-service container from [`docker-compose.yml`](docker-compose.yml)
at http://localhost:8000 (API docs at `/docs`) — the same image Render builds.

## How the single service works

- **Routing.** `/api/*` is the REST API and `/uploads/*` serves locally stored documents; every other
  path is served from the frontend build. Unknown paths return `index.html` so client-side routes
  such as `/family` or `/officer/cases/123` work on refresh (`backend/app/main.py`, `serve_frontend`).
  In local development `backend/web` does not exist, so this is inactive and the frontend keeps
  running on its own dev server.
- **API URL.** The frontend is built with `VITE_API_URL=""` (root Dockerfile), which
  `frontend/src/lib/api.ts` treats as "same origin as the page". No runtime injection is needed.
- **Port.** Render assigns the listen port via `PORT`; [`docker-entrypoint.sh`](docker-entrypoint.sh)
  passes it to uvicorn.
- **Database URL scheme.** Render hands out a `postgres://` URL; `backend/app/core/config.py`
  rewrites it to the `postgresql+psycopg://` scheme SQLAlchemy needs.
- **Startup.** Tables and extensions are created on boot under a Postgres advisory lock, so
  several uvicorn workers starting at once do not race (`app/core/database.py`). PostGIS is attempted
  in its own transaction and skipped if the server lacks it; the map falls back to plain coordinates.

## Uploaded documents and the ephemeral filesystem

Render's Docker services have an ephemeral filesystem: anything written locally, including
`uploads/` when Cloudinary is not configured, is lost on every redeploy or restart. For a real
deployment set the three `CLOUDINARY_*` variables so documents are stored durably. For a short-lived
demo, local storage is fine.

## Loading and resetting demo data

`SEED_ON_BOOT=true` loads the standard demo dataset the first time the database is empty and does
nothing once users exist. **Never** set `SEED_RESET=true` on a deployment with real data: it drops
every table first. To reset a deployed database deliberately, open the service's **Shell** tab and run
`python -m app.seed --reset` by hand.

## Option B — two separate services

Use this only if the API and the frontend must scale or deploy independently. It needs two extra
environment variables that are circular on a first deploy, because Render assigns each service's
`*.onrender.com` hostname only after it is created.

1. **Database** as in A2 step 1.
2. **Backend Web Service**: Docker, Dockerfile path `backend/Dockerfile`, build context `backend`,
   health check `/api/health`. Paste [`render-backend.env`](render-backend.env) via **Add from .env**
   and fill in `DATABASE_URL` and `JWT_SECRET`; leave `CORS_ORIGINS` for step 4. Deploy and copy its
   URL.
3. **Frontend Web Service**: Docker, Dockerfile path `frontend/Dockerfile`, build context `frontend`.
   Paste [`render-frontend.env`](render-frontend.env) and set `API_URL` to the backend URL. Deploy
   and copy its URL. The image is nginx serving the Vite build; `frontend/docker-entrypoint.sh` writes
   `env-config.js` from `API_URL` at container start, so the same image can point at any backend.
4. **Close the loop.** On the backend set `CORS_ORIGINS` to the frontend URL (comma-separate more
   than one) and redeploy. Until then the browser shows CORS errors even though both services are
   healthy.

Locally: `docker compose -f docker-compose.two-services.yml up --build` (frontend on
http://localhost:8080, backend on http://localhost:8000).
