import type { DatabaseClient } from "@edicut/db";
import type { NodeApiEnv } from "./env";

declare module "hono" {
  interface ContextVariableMap {
    db: DatabaseClient;
    env: NodeApiEnv;
  }
}
