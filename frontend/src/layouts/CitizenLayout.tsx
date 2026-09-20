import { Outlet } from "react-router-dom";
import { Assistant } from "../components/Assistant";
import { Navbar } from "../components/Navbar";
import { AppFooter } from "./AppFooter";

export const CITIZEN_NAV = [
  { to: "/", label: "Home" },
  { to: "/family", label: "Family" },
  { to: "/schemes", label: "Schemes" },
  { to: "/applications", label: "Applications" },
  { to: "/benefits", label: "Benefits" },
  { to: "/support", label: "Support" },
];

export function CitizenLayout(): JSX.Element {
  return (
    <div className="app-shell">
      <Navbar items={CITIZEN_NAV} region="GUJARAT · IN" />
      <main className="app-main">
        <div className="page">
          <Outlet />
        </div>
      </main>
      <AppFooter />
      <Assistant />
    </div>
  );
}

export default CitizenLayout;
