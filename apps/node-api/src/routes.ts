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

operationalRoutes.get("/metrics/usage", (c) =>
  c.json({
    ok: true,
    area: "metrics",
    usage: {
      activeProjects: 0,
      processedMinutes: 0,
      storageGb: 0,
    },
  })
);
