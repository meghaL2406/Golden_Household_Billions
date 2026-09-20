import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, AUTH_STORAGE_KEY } from "./api";

export type Role = "CITIZEN" | "SERVICE_OPERATOR" | "VERIFICATION_OFFICER" | "DEPARTMENT_OFFICER" | "ADMIN";

export type User = {
  user_id: string;
  name: string;
  mobile?: string;
  email?: string;
  role: Role;
  department?: string;
  district?: string;
};

type Stored = {
  token: string | null;
  user: User | null;
  familyId: string | null;
  familyCode: string | null;
  familyStatus: string | null;
};

export type AuthContextValue = Stored & {
  login(token: string, user: User, familyId: string | null): void;
  logout(): void;
  refresh(): Promise<void>;
  isOfficer: boolean;
};

const EMPTY: Stored = { token: null, user: null, familyId: null, familyCode: null, familyStatus: null };

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return {
      token: parsed.token ?? null,
      user: parsed.user ?? null,
      familyId: parsed.familyId ?? null,
      familyCode: parsed.familyCode ?? null,
      familyStatus: parsed.familyStatus ?? null,
    };
  } catch {
    return EMPTY;
  }
}

function writeStored(value: Stored) {
  try {
    if (!value.token) localStorage.removeItem(AUTH_STORAGE_KEY);
    else localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function isOfficerRole(role: Role | undefined | null): boolean {
  return !!role && role !== "CITIZEN";
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [state, setState] = useState<Stored>(() => readStored());

  // Keep tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_STORAGE_KEY) setState(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Persisted synchronously (not via an effect) so a request fired by a child component immediately
  // after login()/logout() always reads the current token from localStorage, never a stale one.
  const login = useCallback((token: string, user: User, familyId: string | null) => {
    const next: Stored = { token, user, familyId, familyCode: null, familyStatus: null };
    writeStored(next);
    setState(next);
  }, []);

  const logout = useCallback(() => {
    writeStored(EMPTY);
    setState(EMPTY);
  }, []);

  const refresh = useCallback(async () => {
    const token = readStored().token;
    if (!token) return;
    try {
      const me = await api<{ user: User; family_id: string | null; family_code: string | null; family_status: string | null }>(
        "/auth/me",
      );
      const next: Stored = {
        token,
        user: me.user,
        familyId: me.family_id ?? null,
        familyCode: me.family_code ?? null,
        familyStatus: me.family_status ?? null,
      };
      writeStored(next);
      setState(next);
    } catch (err: any) {
      if (err?.status === 401) {
        writeStored(EMPTY);
        setState(EMPTY);
      }
    }
  }, []);

  // Hydrate family code/status on first load when a token exists.
  useEffect(() => {
    if (state.token) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, refresh, isOfficer: isOfficerRole(state.user?.role) }),
    [state, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default AuthProvider;
