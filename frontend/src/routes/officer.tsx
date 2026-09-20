import type { RouteObject } from "react-router-dom";
import Dashboard from "../pages/officer/Dashboard";
import Families from "../pages/officer/Families";
import FamilyDetail from "../pages/officer/FamilyDetail";
import Cases from "../pages/officer/Cases";
import CaseDetail from "../pages/officer/CaseDetail";
import Schemes from "../pages/officer/Schemes";
import Applications from "../pages/officer/Applications";
import ApplicationDetail from "../pages/officer/ApplicationDetail";
import Benefits from "../pages/officer/Benefits";
import Grievances from "../pages/officer/Grievances";
import GrievanceDetail from "../pages/officer/GrievanceDetail";
import Reports from "../pages/officer/Reports";
import MapPage from "../pages/officer/Map";
import Audit from "../pages/officer/Audit";
import Users from "../pages/officer/Users";

export const officerRoutes: RouteObject[] = [
  { index: true, element: <Dashboard /> },
  { path: "families", element: <Families /> },
  { path: "families/:id", element: <FamilyDetail /> },
  { path: "cases", element: <Cases /> },
  { path: "cases/:id", element: <CaseDetail /> },
  { path: "schemes", element: <Schemes /> },
  { path: "applications", element: <Applications /> },
  { path: "applications/:id", element: <ApplicationDetail /> },
  { path: "benefits", element: <Benefits /> },
  { path: "grievances", element: <Grievances /> },
  { path: "grievances/:id", element: <GrievanceDetail /> },
  { path: "reports", element: <Reports /> },
  { path: "map", element: <MapPage /> },
  { path: "audit", element: <Audit /> },
  { path: "users", element: <Users /> },
];

export default officerRoutes;
