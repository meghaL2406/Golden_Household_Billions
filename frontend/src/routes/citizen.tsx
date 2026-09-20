import type { RouteObject } from "react-router-dom";
import Applications from "../pages/citizen/Applications";
import Benefits from "../pages/citizen/Benefits";
import Enrol from "../pages/citizen/Enrol";
import FamilyProfile from "../pages/citizen/FamilyProfile";
import Home from "../pages/citizen/Home";
import SchemeApply from "../pages/citizen/SchemeApply";
import Schemes from "../pages/citizen/Schemes";
import Support from "../pages/citizen/Support";

export const citizenRoutes: RouteObject[] = [
  { index: true, element: <Home /> },
  { path: "enrol", element: <Enrol /> },
  { path: "family", element: <FamilyProfile /> },
  { path: "schemes", element: <Schemes /> },
  { path: "schemes/:id/apply", element: <SchemeApply /> },
  { path: "applications", element: <Applications /> },
  { path: "benefits", element: <Benefits /> },
  { path: "support", element: <Support /> },
];

export default citizenRoutes;
