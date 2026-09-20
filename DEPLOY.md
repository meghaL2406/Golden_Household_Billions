# Deploying to Render

The image built from the root [`Dockerfile`](Dockerfile) is self-sufficient: one container serves
the API and the built frontend on one port, and if no database is configured it runs an embedded
PostgreSQL inside the container. There is nothing to configure to get a working deployment.

## Contents

1. [Option A — add the repository, done](#option-a--add-the-repository-done)
2. [Option B — blueprint with managed Postgres](#option-b--blueprint-with-managed-postgres)
3. [What happens on first boot](#what-happens-on-first-boot)
4. [Persistence: what survives a redeploy](#persistence-what-survives-a-redeploy)
5. [Optional settings](#optional-settings)
6. [Verifying and troubleshooting](#verifying-and-troubleshooting)
7. [Option C — two separate services](#option-c--two-separate-services)

## Option A — add the repository, done

1. Push the repository to GitHub or GitLab.
2. Render dashboard: **New → Web Service**, pick the repository.
3. Render detects the root `Dockerfile` (runtime **Docker**, Dockerfile path `./Dockerfile`, build
   context `.`). Set the health check path to `/api/health` if the form offers it. Add **no**
   environment variables.
4. **Create Web Service.** The first build takes a few minutes. When the log shows
   `Application startup complete`, open the service URL and sign in with a demo login
   (OTP `123456`; see the README).

That is the entire procedure. The container starts its own PostgreSQL, generates a JWT secret and
loads the demo dataset. The trade-off is in [Persistence](#persistence-what-survives-a-redeploy):
on Render's ephemeral disk the embedded database is recreated (and reseeded) on every deploy and
restart, which is right for a demo and wrong for real data.

## Option B — blueprint with managed Postgres

For data that must survive deploys, let Render provision a managed database and hand its URL to the
container. [`render.yaml`](render.yaml) describes both resources with every value fixed, generated or
wired, so there are still no prompts:

1. Push the repository.
2. **New → Blueprint**, pick the repository, **Apply**.

Render creates `familyid-db` (Postgres 16) and the `familyid` web service, injects `DATABASE_URL`
from the database and a generated `JWT_SECRET`, and deploys. The container sees `DATABASE_URL` and
does not start the embedded server. Note that Render's free Postgres plan expires after 30 days;
change `plan` in `render.yaml` for anything longer-lived.

## What happens on first boot

[`docker-entrypoint.sh`](docker-entrypoint.sh), in order:

1. Starts as root only to take ownership of `/app/data` (a mounted disk is often root-owned), then
   re-executes itself as the unprivileged `appuser`.
2. **Database.** If `DATABASE_URL` is empty: initialises `/app/data/pgdata` on first run, starts
   PostgreSQL 17 on `127.0.0.1:5432` (loopback only, trust auth inside the container), creates the
   `familyid` database and exports `DATABASE_URL` for the app. Otherwise it uses the URL as given
   (a `postgres://` scheme is normalised by `app/core/config.py`).
3. **Secret.** If `JWT_SECRET` is empty, generates one and keeps it in `/app/data/jwt_secret` so
   sessions survive restarts when that directory persists.
4. **Schema and data.** The FastAPI lifespan creates extensions and tables under an advisory lock;
   with `SEED_ON_BOOT=true` (the image default) the demo dataset is loaded when the database has no
   users, and skipped otherwise.
5. **Serve.** uvicorn binds to `$PORT` (Render sets it) with `WEB_CONCURRENCY` workers. `/api/*` is
   the API, `/uploads/*` local documents, everything else the frontend with an `index.html`
   fallback for client-side routes. On `SIGTERM` uvicorn and the embedded PostgreSQL stop cleanly.

## Persistence: what survives a redeploy

| Where the data lives | Plain Web Service (Option A) | Blueprint (Option B) |
|---|---|---|
| Database rows | Embedded, in `/app/data/pgdata` on ephemeral disk: **lost on deploy/restart**, then reseeded | Managed Postgres: **kept** |
| Uploaded documents (no Cloudinary) | `/app/data/uploads`: **lost on deploy/restart** | Same: **lost** unless Cloudinary is set |
| JWT secret | `/app/data/jwt_secret`: regenerated, existing sessions invalidated | From Render, **kept** |

Two ways to keep everything with Option A: mount a Render **Disk** at `/app/data` (paid instance
types only; it persists the database, uploads and secret in one place), or switch to Option B. For
documents specifically, set the three `CLOUDINARY_*` variables and they are stored off-box.

Free web services also spin down after inactivity; the first request afterwards restarts the
container, which for Option A means a fresh, reseeded database.

## Optional settings

Everything has a working default. [`render.env`](render.env) lists the overrides and can be pasted
into the service's **Environment → Add from .env**:

| Variable | Default | Set it when |
|---|---|---|
| `DATABASE_URL` | empty → embedded PostgreSQL | you want managed Postgres without the blueprint |
| `JWT_SECRET` | generated once, persisted in `/app/data` | you run more than one instance |
| `DEV_MODE` / `DEMO_OTP` | `true` / `123456` (fixed OTP, echoed by the API) | real OTP delivery is configured; set `DEV_MODE=false` |
| `SEED_ON_BOOT` | `true` (no-op once users exist) | never needed; `SEED_RESET=true` drops all tables first — do not use on real data |
| `CLOUDINARY_*` | empty → local `/app/data/uploads` | documents must survive deploys |
| `SMTP_*` | empty → email OTP disabled | you want email login codes |
| `CORS_ORIGINS` | empty (same origin) | another site must call the API |
| `WEB_CONCURRENCY` | `2` | tuning; keep 1–2 on the free instance |

## Keeping a free instance awake

Free web services spin down after 15 minutes without traffic; the next visitor then waits through a
cold start (the embedded database also restarts and reseeds on a plain web service). To prevent it,
add a monitor that requests the service every 5 to 10 minutes:

| Setting | Value |
|---|---|
| Monitor type | HTTP(s) |
| URL | `https://<your-service>.onrender.com/api/ping` |
| Interval | 5 minutes (UptimeRobot's free minimum) — anything under 15 works |
| Method | GET (HEAD is also accepted) |
| Expected | HTTP 200, body `{"ok": true, "at": "..."}` |

`/api/ping` needs no authentication and does not touch the database, so it is safe to expose and
cheap to poll. `/api/health` also works but reports configuration flags; prefer `/api/ping` for
monitors.

## Verifying and troubleshooting

- **Health**: `https://<service>.onrender.com/api/health` returns `{"status":"ok", ...}`; the API
  docs are at `/docs`.
- **Log shows `connection to server at "127.0.0.1", port 5432 failed`** — this was the failure mode
  of an earlier build when `DATABASE_URL` was unset. The current image never does this: with no
  `DATABASE_URL` it starts the embedded server, and if the variable is set but wrong it fails with
  the database error for that URL. If you see it, the service is running an old build — trigger a
  **Manual Deploy → Clear build cache & deploy**.
- **`DATABASE_URL is not set`** in the log — only possible when running the backend outside this
  image (for example `backend/Dockerfile`); set the variable or use the root image.
- **Login works but data vanished** — the container restarted on an ephemeral disk (Option A). See
  [Persistence](#persistence-what-survives-a-redeploy).
- **Build fails installing `postgresql-17`** — the base image is pinned to Debian trixie, which
  ships 17; if the pin is changed, change the package and `PG_BIN` to match (the entrypoint also
  auto-detects the installed version).

Locally, the same image runs with `docker compose up --build` (uses managed-style Postgres from the
compose file) or, to exercise the zero-configuration path exactly as Render would:

```bash
docker build -t familyid . && docker run --rm -p 8000:8000 familyid
```

## Option C — two separate services

Kept for when the API and the frontend must scale or deploy independently. Uses
[`backend/Dockerfile`](backend/Dockerfile) (API only; requires `DATABASE_URL`) and
[`frontend/Dockerfile`](frontend/Dockerfile) (nginx serving the Vite build; its
`docker-entrypoint.sh` writes `env-config.js` from `API_URL` at container start). Two variables are
circular on a first deploy because each service's URL exists only after it is created:

1. Create the database (as in Option B, or manually).
2. Backend Web Service: Dockerfile `backend/Dockerfile`, context `backend`, health check
   `/api/health`; paste [`render-backend.env`](render-backend.env), fill `DATABASE_URL` and
   `JWT_SECRET`. Deploy, copy its URL.
3. Frontend Web Service: Dockerfile `frontend/Dockerfile`, context `frontend`; paste
   [`render-frontend.env`](render-frontend.env) with `API_URL` = backend URL. Deploy, copy its URL.
4. On the backend set `CORS_ORIGINS` to the frontend URL and redeploy.

Locally: `docker compose -f docker-compose.two-services.yml up --build`.
