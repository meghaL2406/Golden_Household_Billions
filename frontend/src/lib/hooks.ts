import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";
import type { Tone } from "./format";

/* ---------------- useApi ---------------- */

export type UseApiResult<T> = {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload(): void;
};

export function useApi<T = any>(path: string | null, params?: Record<string, any>, deps: any[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const paramsKey = JSON.stringify(params ?? {});

  useEffect(() => {
    if (!path) {
      setData(undefined);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<T>(path, { params })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : err?.message ?? "Something went wrong");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, paramsKey, tick, ...deps]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

/* ---------------- Toasts ---------------- */

export type ToastItem = { id: number; message: string; tone: Tone };
type ToastContextValue = { push(message: string, tone?: Tone): void; toasts: ToastItem[]; dismiss(id: number): void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (message: string, tone: Tone = "neutral") => {
      const id = ++seq.current;
      setToasts((t) => [...t, { id, message, tone }].slice(-4));
      window.setTimeout(() => dismiss(id), tone === "danger" ? 6000 : 4000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ push, toasts, dismiss }), [push, toasts, dismiss]);

  return createElement(ToastContext.Provider, { value }, children, createElement(ToastViewport, { toasts, dismiss }));
}

function ToastViewport({ toasts, dismiss }: { toasts: ToastItem[]; dismiss(id: number): void }) {
  if (toasts.length === 0) return null;
  return createElement(
    "div",
    { className: "fid-toasts", role: "status", "aria-live": "polite" },
    toasts.map((t) =>
      createElement(
        "div",
        { key: t.id, className: `fid-toast fid-toast--${t.tone}` },
        createElement("span", { className: "fid-toast__dot" }),
        createElement("span", { className: "fid-toast__msg" }, t.message),
        createElement("button", { type: "button", className: "fid-toast__close", "aria-label": "Dismiss", onClick: () => dismiss(t.id) }, "×"),
      ),
    ),
  );
}

export function useToast(): { push(message: string, tone?: Tone): void } {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { push: (message: string) => console.info("[toast]", message) };
  }
  return { push: ctx.push };
}

/* ---------------- Small helpers ---------------- */

export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return v;
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState<boolean>(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

export function useOnClickOutside(ref: React.RefObject<HTMLElement>, handler: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const listener = (e: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler, active]);
}
