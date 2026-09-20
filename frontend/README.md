# Family ID — Frontend

Vite + React 18 + TypeScript shell for the Family ID citizen/officer portal. No UI library; styling follows
`../docs/DESIGN.md` via CSS variables in `src/styles/tokens.css`.

## Getting started

```bash
npm install
cp .env.example .env   # set VITE_API_URL if the API is not on localhost:8000
npm run dev             # http://localhost:5173
```

## Scripts

- `npm run dev` — start the Vite dev server on port 5173
- `npm run build` — production build
- `npm run preview` — preview the production build
- `npm run typecheck` — `tsc --noEmit`

## Structure

- `src/main.tsx`, `src/App.tsx` — entry point and route tree (login, citizen shell, officer shell)
- `src/lib/` — `api.ts` (fetch wrapper), `auth.tsx` (auth context), `guards.tsx` (route guards),
  `format.ts` (formatting helpers), `hooks.ts` (`useApi`, toasts, misc hooks)
- `src/components/` — shared design-system components (see `../docs/FRONTEND_CONTRACT.md`)
- `src/layouts/` — `CitizenLayout`, `OfficerLayout`, shared navbar/footer shell
- `src/pages/auth/` — OTP login and sign-up, with a toggle between signing in and creating a new citizen account
- `src/pages/citizen/`, `src/pages/officer/` — feature pages
- `src/routes/citizen.tsx`, `src/routes/officer.tsx` — route tables consumed by `App.tsx`

The API base URL is read from `VITE_API_URL` (default `http://localhost:8000`); see `../docs/API_CONTRACT.md`.
