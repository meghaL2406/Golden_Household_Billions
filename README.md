# Family ID — Unified Family Identity and Benefits Platform (Gujarat demonstration)

One verified family profile, built from existing government records plus citizen documents, drives a
unique Family ID, a rule-based eligibility engine, benefit applications with end-to-end delivery
tracking, and grievance redressal.

Stack: FastAPI + SQLAlchemy 2 + PostgreSQL 16 (PostGIS optional) · React 18 + Vite + TypeScript · Cloudinary (or local files).

## Run

```bash
# database (PostgreSQL 16 must be running locally)
createdb familyid

# backend
cd backend && cp .env.example .env
uv venv --python 3.12 .venv && uv pip install -r requirements.txt --python .venv/bin/python
.venv/bin/python -m app.seed --reset
.venv/bin/uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. API docs at http://localhost:8000/docs.

## Demo logins (OTP is 123456 in DEV_MODE)

| Role | Mobile | Notes |
|---|---|---|
| Citizen | 9876500001 | Ramesh Patel, verified family in Ahmedabad |
| Citizen | 9876500002 | New citizen, no family, has a Ration/PDS record to claim |
| Service operator | 9000000001 | |
| Verification officer | 9000000002 | |
| Department officer | 9000000003 | |
| Admin | 9000000004 / admin@familyid.gov.in | |

## Documents

- [API_CONTRACT.md](API_CONTRACT.md) — every endpoint and payload
- [FRONTEND_CONTRACT.md](FRONTEND_CONTRACT.md) — component and page inventory
- [DESIGN.md](DESIGN.md) — design system brief
- [backend/README.md](backend/README.md) — configuration (Cloudinary, SMTP), seeding

## Panel feedback addressed

- Full benefit status chain: Eligible → Applied → Under review → Approved → Sanctioned → Disbursed → Delivered → Received, with citizen confirmation.
- Grievance and redressal module with due dates, escalation and ratings; "not received" auto-opens a grievance.
- Multiple-identity fraud (Rajesh / Rakesh Kumar): scored duplicate detection over name variants, date of birth, parent name, mobile, Aadhaar and locality; anything above threshold is held for officer review rather than accepted.
- Household size is asked up front and reconciled against members actually added.
- Login by mobile or email OTP (SMTP credentials pluggable).
