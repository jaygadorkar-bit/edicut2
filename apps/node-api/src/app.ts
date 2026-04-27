import { Hono } from "hono";
import { SERVICE_AUTH_HEADER, logEvent } from "@edicut/shared";
import { loadNodeApiEnv } from "./env.js";
import { operationalRoutes } from "./routes.js";

const app = new Hono().basePath("/api/node");

app.use("*", async (c, next) => {
  const env = loadNodeApiEnv(process.env);
  const token = c.req.header(SERVICE_AUTH_HEADER);
  const startedAt = Date.now();

  if (token !== env.SERVICE_SHARED_SECRET) {
    logEvent("warn", "node_api_unauthorized", {
      runtime: "vercel-node",
      path: c.req.path,
      method: c.req.method,
    });
    return c.json({ error: "Unauthorized service request." }, 401);
  }

  c.set("env", env);

  await next();

  logEvent("info", "node_api_request", {
    runtime: "vercel-node",
    path: c.req.path,
    method: c.req.method,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
});

app.get("/health", async (c) => {
  const env = c.get("env");

  return c.json({
    ok: true,
    service: "node-api",
    authHeader: SERVICE_AUTH_HEADER,
    runtime: "vercel-node",
    databaseHost: new URL(env.DATABASE_URL).host,
  });
});

app.get("/metrics/usage", (c) =>
  c.json({
    ok: true,
    runtime: "vercel-node",
    requestClasses: [
      "node-op-contact-intake",
      "node-op-password-reset-request",
      "node-op-password-reset-consume",
      "node-op-security-settings",
    ],
  })
);

app.route("/", operationalRoutes);

export default app;
