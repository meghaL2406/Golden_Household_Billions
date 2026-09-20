# Family ID Platform — Backend

FastAPI + SQLAlchemy 2.0 (sync) + PostgreSQL. The full endpoint reference lives in
[`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md); the interactive OpenAPI docs are served at
`http://localhost:8000/docs` once the server is running.

## 1. Prerequisites

- Python 3.12
- PostgreSQL 14+ with a database named `familyid` (`createdb familyid`).
  The `pg_trgm` and `uuid-ossp` extensions are created automatically at start-up; PostGIS is optional.
- [uv](https://docs.astral.sh/uv/) (recommended) or plain `pip`.

## 2. Setup with uv

```bash
cd backend
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python -r requirements.txt
# then review backend/.env (section 3)
```

Without uv: `python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt`.

## 3. Environment (`backend/.env`)

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | SQLAlchemy URL, psycopg 3 driver | `postgresql+psycopg://mac@localhost:5432/familyid` |
| `JWT_SECRET` | Token signing secret; change outside development | `change-me-in-production` |
| `JWT_EXPIRE_MINUTES` | Token lifetime | `720` |
| `DEV_MODE` | When `true`, OTPs are returned in the API response and logged | `true` |
| `DEMO_OTP` | Fixed OTP accepted in DEV_MODE | `123456` |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Document storage. Leave all three blank to store files locally under `backend/uploads/` (served at `/uploads/...`). | blank |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | Email OTP delivery. Leave host, user or password blank to disable sending. | blank / `587` / blank / blank / `noreply@familyid.gov.in` |
| `CORS_ORIGINS` | Comma-separated allowed origins for the frontend | `http://localhost:5173` |

## 4. Seed demo data

```bash
cd backend
.venv/bin/python -m app.seed --reset   # drop + recreate every table, then seed
.venv/bin/python -m app.seed           # create tables; seed only if the database is empty
```

The seed is deterministic (fixed random seed) and prints a count table when it finishes. It creates
6 users, 10 schemes, 45 families across 16 Gujarat districts (about 190 members with two-way
relationships), documents (small generated PDFs under `uploads/seed/`), verification cases including a
duplicate-person demo (Rajesh Kumar / Rakesh Kumar, Rajkot) and an Aadhaar-mismatch demo, scheme
eligibility for every verified and pending family, 25 applications, benefit records in every delivery
state, 6 grievances, notifications and an audit trail.

If `--reset` fails because another process holds table locks (for example a running API server), the
script waits 20 seconds and retries once; stop the server if it still fails.

## 5. Run the API

```bash
./run.sh          # = .venv/bin/uvicorn app.main:app --reload --port 8000
```

Health check: `GET http://localhost:8000/api/health`.

## 6. Demo logins (OTP `123456` in DEV_MODE)

| Role | Identifier | Notes |
| --- | --- | --- |
| CITIZEN | mobile `9876500001` | Ramesh Patel, verified family in Ahmedabad (BPL, 5 members, approved Child Benefit, pending Student Scholarship) |
| CITIZEN | mobile `9876500002` | Suresh Chauhan, new citizen with no family; a Ration/PDS household `GJ-RC-778812` and an Aadhaar record are available for the enrolment demo |
| SERVICE_OPERATOR | mobile `9000000001` | Kiran Desai |
| VERIFICATION_OFFICER | mobile `9000000002` | Bhavna Trivedi |
| DEPARTMENT_OFFICER | mobile `9000000003` | Nilesh Joshi |
| ADMIN | mobile `9000000004` or email `admin@familyid.gov.in` | Anita Sharma |

Login flow: `POST /api/auth/request-otp` with `{channel: "MOBILE", identifier}` then
`POST /api/auth/verify-otp` with the returned `challenge_id` and code `123456`.

## 7. Project layout

```
app/main.py            FastAPI app, router registration, static /uploads mount
app/core/              settings (.env), database engine/session, security (JWT, OTP)
app/models/entities.py every SQLAlchemy model (single source of truth for response shapes)
app/routers/           one module per API area (auth, families, documents, verification, ...)
app/services/          eligibility engine, duplicate detection, external source mocks, life events
app/seed.py            deterministic demo data (this document, section 4)
uploads/               local document storage when Cloudinary is not configured
```
