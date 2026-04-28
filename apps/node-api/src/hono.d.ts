import type { NodeApiEnv } from "./env";

declare module "hono" {
  interface ContextVariableMap {
    env: NodeApiEnv;
  }
}
