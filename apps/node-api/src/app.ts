import { Hono } from "hono";
import { operationalRoutes } from "./routes.js";

const app = new Hono().basePath("/api/node");

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "node-api",
    runtime: "hono-node",
    purpose: "fresh-start-backend",
  });
});

app.route("/", operationalRoutes);

export default app;
