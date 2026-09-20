import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type Role } from "./auth";

export const OFFICER_ROLES: Role[] = ["SERVICE_OPERATOR", "VERIFICATION_OFFICER", "DEPARTMENT_OFFICER", "ADMIN"];

export function homeForRole(role: Role | undefined | null): string {
  return role && role !== "CITIZEN" ? "/officer" : "/";
}

export function RequireAuth({ children }: { children: ReactNode }): JSX.Element {
  const { token, user } = useAuth();
  const location = useLocation();
  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }): JSX.Element {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return <>{children}</>;
}

/** Redirects an already signed-in user away from the login page. */
export function RedirectIfAuthed({ children }: { children: ReactNode }): JSX.Element {
  const { token, user } = useAuth();
  if (token && user) return <Navigate to={homeForRole(user.role)} replace />;
  return <>{children}</>;
}
