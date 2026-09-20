export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

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

/** Absolute URL for a possibly relative file_url returned by the API. */
export function apiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? "" : "/"}${path}`;
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
  const url = new URL(`${API_URL}/api${path.startsWith("/") ? "" : "/"}${path}`);
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
