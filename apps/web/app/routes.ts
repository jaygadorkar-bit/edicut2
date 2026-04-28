import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("admin", "routes/admin.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("health", "routes/health.ts"),
] satisfies RouteConfig;
