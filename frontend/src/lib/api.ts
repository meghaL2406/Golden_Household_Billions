declare global {
  interface Window {
    __ENV__?: { VITE_API_URL?: string };
  }
}

// Resolution order:
//   1. Runtime config injected by the Docker container at start-up (public/env-config.js, written by
//      frontend/docker-entrypoint.sh) — only used by the two-separate-services deploy, where the
//      frontend needs to be told the backend's URL after the fact. An *empty string* here is a
//      deliberate, explicit value (not "unset"): it means same-origin — see point 3.
//   2. The value baked in at build time by Vite (frontend/.env, or frontend/.env.production written by
//      the root Dockerfile for the single-service build).
//   3. The local dev default. In the single-service Docker image the frontend is served BY the backend
//      on the same origin, so its build sets VITE_API_URL="" and every request below is a same-origin
//      relative path — no CORS involved at all, unlike the two-service deploy.
function resolveApiUrl(): string {
  if (typeof window !== "undefined" && window.__ENV__ && "VITE_API_URL" in window.__ENV__) {
    return window.__ENV__.VITE_API_URL ?? "";
  }
  const buildTime = import.meta.env.VITE_API_URL as string | undefined;
  return buildTime !== undefined ? buildTime : "http://localhost:8000";
}

export const API_URL: string = resolveApiUrl();

export const AUTH_STORAGE_KEY = "familyid.auth";

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, message: string, detail?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Absolute (or, same-origin, root-relative) URL for a possibly relative file_url returned by the API. */
export function apiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const rel = path.startsWith("/") ? path : `/${path}`;
  return API_URL ? `${API_URL}${rel}` : rel;
}

export function readStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === "string" ? parsed.token : null;
  } catch {
    return null;
  }
}

function clearAuthAndRedirect() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

function extractMessage(payload: any, statusText: string): string {
  const detail = payload?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") return detail.message;
  if (typeof payload?.message === "string") return payload.message;
  return statusText || "Request failed";
}

export type ApiInit = {
  method?: string;
  body?: any;
  form?: FormData;
  params?: Record<string, any>;
};

export async function api<T = any>(path: string, init: ApiInit = {}): Promise<T> {
  const rel = `/api${path.startsWith("/") ? "" : "/"}${path}`;
  // A relative `rel` needs a base to become a URL object; window.location.origin is exactly right
  // for a same-origin, single-service deploy, and is otherwise simply discarded once API_URL is absolute.
  const url = new URL(API_URL ? `${API_URL}${rel}` : rel, typeof window !== "undefined" ? window.location.origin : undefined);
  if (init.params) {
    for (const [key, value] of Object.entries(init.params)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const token = readStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (init.form) {
    body = init.form;
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }

  const method = init.method ?? (body !== undefined ? "POST" : "GET");

  let res: Response;
  try {
    res = await fetch(url.toString(), { method, headers, body });
  } catch (err: any) {
    throw new ApiError(0, "The server could not be reached. Check that the API is running.", err);
  }

  if (res.status === 401) {
    // Only treat this as an expired session (and force a redirect) when a token was actually sent.
    // A 401 with no token means a component fired a request before login finished persisting the
    // token; redirecting in that case would wipe out a login that just succeeded.
    if (token) clearAuthAndRedirect();
    throw new ApiError(401, token ? "Your session has expired. Sign in again." : "Authentication required.");
  }

  const text = await res.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, extractMessage(payload, res.statusText), payload?.detail ?? payload);
  }
  return payload as T;
}

export default api;
