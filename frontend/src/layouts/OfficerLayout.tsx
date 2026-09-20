import { Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { AppFooter } from "./AppFooter";

export const OFFICER_NAV = [
  { to: "/officer", label: "Dashboard" },
  { to: "/officer/families", label: "Families" },
  { to: "/officer/cases", label: "Verification" },
  { to: "/officer/schemes", label: "Schemes" },
  { to: "/officer/applications", label: "Applications" },
  { to: "/officer/reports", label: "Reports" },
];

export function OfficerLayout(): JSX.Element {
  return (
    <div className="app-shell">
      <Navbar items={OFFICER_NAV} region="GUJARAT · IN" />
      <main className="app-main">
        <div className="page">
          <Outlet />
        </div>
      </main>
      <AppFooter />
    </div>
  );
}

export default OfficerLayout;
