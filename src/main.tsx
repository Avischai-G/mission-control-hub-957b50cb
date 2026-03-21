import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const routeAliases: Record<string, string> = {
  "/code-tools": "/files",
  "/agents": "/files",
  "/tools": "/files",
  "/night-report": "/files",
  "/memory": "/files",
  "/cron": "/cron-jobs",
  "/calendar": "/cron-jobs",
};

const knownRoutes = ["/chat", "/files", "/cron-jobs", "/calendar", "/agents", "/tools", "/code-tools", "/cron", "/night-report", "/feed", "/memory"];

if (!window.location.hash) {
  const { pathname, search } = window.location;
  const matchedRoute = knownRoutes.find((route) => pathname === route || pathname.endsWith(route));

  if (matchedRoute) {
    const basePath = pathname.slice(0, pathname.length - matchedRoute.length) || "/";
    const normalizedBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;
    const targetRoute = routeAliases[matchedRoute] || matchedRoute;
    window.history.replaceState(null, "", `${normalizedBasePath}#${targetRoute}${search}`);
  }
}

createRoot(document.getElementById("root")!).render(<App />);
