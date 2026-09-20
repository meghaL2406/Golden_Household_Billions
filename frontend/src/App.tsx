import { BrowserRouter, Navigate, useRoutes, type RouteObject } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import { ToastProvider } from "./lib/hooks";
import { RequireAuth, RequireRole, RedirectIfAuthed, OFFICER_ROLES } from "./lib/guards";
import { CitizenLayout } from "./layouts/CitizenLayout";
import { OfficerLayout } from "./layouts/OfficerLayout";
import { Login } from "./pages/auth/Login";
import { NotificationsPage } from "./pages/NotificationsPage";
import { citizenRoutes } from "./routes/citizen";
import { officerRoutes } from "./routes/officer";

function AppRoutes(): JSX.Element | null {
  const routes: RouteObject[] = [
    {
      path: "/login",
      element: (
        <RedirectIfAuthed>
          <Login />
        </RedirectIfAuthed>
      ),
    },
    {
      path: "/",
      element: (
        <RequireAuth>
          <RequireRole roles={["CITIZEN"]}>
            <CitizenLayout />
          </RequireRole>
        </RequireAuth>
      ),
      children: [...citizenRoutes, { path: "notifications", element: <NotificationsPage /> }],
    },
    {
      path: "/officer",
      element: (
        <RequireAuth>
          <RequireRole roles={OFFICER_ROLES}>
            <OfficerLayout />
          </RequireRole>
        </RequireAuth>
      ),
      children: [...officerRoutes, { path: "notifications", element: <NotificationsPage /> }],
    },
    { path: "*", element: <Navigate to="/" replace /> },
  ];

  return useRoutes(routes);
}

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
