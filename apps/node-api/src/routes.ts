import { Hono } from "hono";

export const operationalRoutes = new Hono();

operationalRoutes.get("/admin/summary", (c) =>
  c.json({
    ok: true,
    area: "admin",
    users: 0,
    pendingActions: 0,
  })
);

operationalRoutes.get("/dashboard/summary", (c) =>
  c.json({
    ok: true,
    area: "dashboard",
    activeProjects: 0,
    notifications: 0,
  })
);
