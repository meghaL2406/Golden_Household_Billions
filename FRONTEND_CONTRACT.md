# Family ID — Frontend Contract (Vite + React 18 + TypeScript, react-router-dom v6, no UI library)

Location: `frontend/`. Dev server http://localhost:5173, API at `import.meta.env.VITE_API_URL ?? "http://localhost:8000"`.
Design: follow `DESIGN.md` exactly (tokens, DM Sans + IBM Plex Mono, radii families, eyebrows, one blue).
Brand wordmark: "familyid" lowercase with a --blue full stop. Region label in navbar: "GUJARAT · IN".

## Ownership (parallel agents — do not edit files you do not own)
- shell agent owns: `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`, `src/styles/base.css`, `src/components/**`, `src/lib/**`, `src/pages/auth/**`, `src/layouts/**`, `index.html`, `vite.config.ts`, `package.json`
- citizen agent owns: `src/routes/citizen.tsx`, `src/pages/citizen/**`
- officer agent owns: `src/routes/officer.tsx`, `src/pages/officer/**`
`App.tsx` imports `{ citizenRoutes }` from `./routes/citizen` and `{ officerRoutes }` from `./routes/officer`
(each is `RouteObject[]` rendered inside the matching layout). Each routes file must exist and export that array.

## src/lib/api.ts
```ts
export const API_URL: string;
export function apiUrl(path: string): string;            // absolute URL for relative file_url
export async function api<T=any>(path: string, init?: { method?: string; body?: any; form?: FormData; params?: Record<string, any> }): Promise<T>;
// - prefixes `${API_URL}/api`, adds Bearer token from auth store, JSON-encodes `body`, sends `form` as multipart,
//   appends `params` (skipping undefined/null/""), throws ApiError { status, message, detail } on non-2xx
export class ApiError extends Error { status: number; detail: any }
```

## src/lib/auth.tsx
```ts
type User = { user_id: string; name: string; mobile?: string; email?: string; role: Role; department?: string; district?: string };
type Role = "CITIZEN"|"SERVICE_OPERATOR"|"VERIFICATION_OFFICER"|"DEPARTMENT_OFFICER"|"ADMIN";
export function AuthProvider({children}): JSX.Element;      // persists token+user in localStorage key "familyid.auth"
export function useAuth(): { user: User|null; token: string|null; familyId: string|null; familyCode: string|null; familyStatus: string|null;
                              login(token: string, user: User, familyId: string|null): void; logout(): void; refresh(): Promise<void>; isOfficer: boolean };
```
Routing: `/login` (OTP page: choose Mobile or Email, request code, enter 6 digits; in DEV the response includes `dev_otp` — show it in an info Notice "Development mode: your code is 123456"). After login: CITIZEN -> `/` (citizen layout), officers -> `/officer`. `RequireAuth` and `RequireRole` wrappers in `src/lib/guards.tsx`.

## src/lib/format.ts
`fmtDate(iso)`, `fmtDateTime(iso)`, `fmtMoney(n)` ("₹ 12,000" with unit outside via components), `titleCase(code)` ("NEEDS_DOCUMENT" -> "Needs document"), `statusTone(status): Tone` mapping (VERIFIED/APPROVED/ELIGIBLE/DELIVERED/RECEIVED_CONFIRMED/RESOLVED -> success; PENDING*/UNDER_REVIEW/SUBMITTED/NEEDS_DOCUMENT/INFO_REQUESTED/PROVISIONAL -> warning; REJECTED/NOT_ELIGIBLE/NOT_RECEIVED/DISPUTED/FLAGGED -> danger; DRAFT/UNVERIFIED/OPEN -> neutral; else blue).

## src/lib/hooks.ts
`useApi<T>(path: string|null, params?: Record<string,any>, deps?: any[]) => { data: T|undefined; loading: boolean; error: string|null; reload(): void }`
`useToast()` -> `{ push(message: string, tone?: Tone) }` (ToastProvider is mounted in App).

## src/components (each in its own file, default + named export, all styled per DESIGN.md)
- `Eyebrow` ({children})  mono 10px uppercase eyebrow
- `PageHeader` ({eyebrow, title, description?, action?: ReactNode})
- `Card` ({title?, eyebrow?, subnote?, action?, children, className?, onClick?, padding?}) hover border #a6bdea; clickable when onClick
- `StatTile` ({label, value: ReactNode, unit?, note?, icon?}) and `StatRow` ({children}) — tiles separated by 1px --line verticals
- `Tag` ({tone?: "blue"|"success"|"warning"|"danger"|"neutral", children})  and `StatusTag` ({status: string}) uses statusTone + titleCase
- `Button` ({variant?: "primary"|"outline"|"ghost"|"danger", size?: "sm"|"md", icon?, loading?, ...button props})
- `Input`, `Select`, `Textarea` ({label?, hint?, error?, ...native props}) — 40px tall, label 10px muted above
- `Field` ({label, hint?, children}) generic wrapper
- `Table<T>` ({columns: {key: string; header: string; render?: (row:T)=>ReactNode; width?: string; align?: "left"|"right"}[], rows: T[], rowKey: (r:T)=>string, onRowClick?, empty?: string})
- `Notice` ({tone?: "info"|"warning"|"danger"|"success", children})
- `EmptyState` ({icon?, title, description, action?})
- `Modal` ({open, title, onClose, children, footer?, width?}) radius 20px
- `Drawer` ({open, title, onClose, children}) right side panel
- `Stepper` ({steps: {label: string; done?: boolean; active?: boolean}[]}) horizontal for status chains
- `Timeline` ({items: {title: string; at?: string; note?: string; tone?: Tone}[]})
- `KeyValue` ({items: {label: string; value: ReactNode}[], columns?: 2|3})
- `Tabs` ({tabs: {key: string; label: string; count?: number}[], active, onChange})
- `Spinner`, `Skeleton` ({rows?})
- `FileUpload` ({onFile(file: File): void, accept?, hint?})  drag/drop box
- `Icon` ({name: IconName, size?}) — inline SVG set (stroke 1.6): users, user-plus, file, file-check, shield, search, bell, settings, globe, map, chart, check, x, alert, clock, arrow-right, upload, home, heart, gift, layers, log-out, menu, plus, minus, edit, trash, eye, filter, download, refresh, sparkle, info, phone, mail, id, baby, ring, cross, split, merge, pin, message
- `Navbar` ({items: {to: string; label: string}[], region?: string}) — fixed pattern from DESIGN.md, bell badge from `GET /notifications` unread count, avatar initials, gear opens a menu with "Sign out"; below 900px hamburger.
- `Layouts`: `src/layouts/CitizenLayout.tsx` (nav: Home `/`, Family `/family`, Schemes `/schemes`, Applications `/applications`, Benefits `/benefits`, Support `/support`), `src/layouts/OfficerLayout.tsx` (nav: Dashboard `/officer`, Families `/officer/families`, Verification `/officer/cases`, Schemes `/officer/schemes`, Applications `/officer/applications`, Reports `/officer/reports`; Map, Grievances, Audit and Users are reached from Dashboard/Reports cards, not the nav). Both render `<Outlet/>` inside a 1180px container.
- Floating assistant launcher is NOT needed.

## Page inventory
Citizen (`src/pages/citizen`): Home (status overview + next steps + notifications), Enrol wizard `/enrol` (Step 1 search existing / claim ration → Step 2 household size + address → Step 3 head details → Step 4 add members with relationship → Step 5 documents → Step 6 review + submit), FamilyProfile `/family` (members, relationships, addresses, documents, verification cases, completeness, add member modal, add relationship modal, upload document modal, report life event modal incl. newborn flow), Schemes `/schemes` (eligibility cards with reason + status + apply), SchemeApply `/schemes/:id/apply` (pre-filled review + attach docs), Applications `/applications` (+ detail drawer with status stepper), Benefits `/benefits` (delivery status chain + Confirm received / Not received), Support `/support` (grievances list + new grievance + detail with rate/reopen), Notifications `/notifications`.
Officer (`src/pages/officer`): Dashboard `/officer`, Families `/officer/families` + `/officer/families/:id`, Cases `/officer/cases` + `/officer/cases/:id` (side-by-side comparison, documents preview, actions incl. merge), Schemes `/officer/schemes` (list, create/edit with rule builder using `/schemes/rule-fields`, toggle, eligible families), Applications `/officer/applications` + `/officer/applications/:id`, Benefits `/officer/benefits` (delivery updates), Grievances `/officer/grievances` + `/officer/grievances/:id`, Reports `/officer/reports` (district, scheme, applications, benefits, cases with simple SVG bar charts using --blue and #9fb6ea), Map `/officer/map` (Leaflet via CDN <script>/<link> in index.html is NOT allowed — use `leaflet` npm package; district circles + jittered points, filters), Audit `/officer/audit`, Users `/officer/users` (ADMIN).
