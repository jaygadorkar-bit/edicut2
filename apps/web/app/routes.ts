import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("portfolio", "routes/portfolio.tsx"),
  route("pricing", "routes/pricing.tsx"),
  route("contact", "routes/contact.tsx"),
  route("health", "routes/health.ts"),
  route("login", "routes/login.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("logout", "routes/logout.ts"),
  route("dashboard", "routes/dashboard.tsx"),
  route("dashboard/projects", "routes/dashboard-projects.tsx"),
  route("dashboard/packages", "routes/dashboard-packages.tsx"),
  route("dashboard/security", "routes/dashboard-security.tsx"),
] satisfies RouteConfig;
