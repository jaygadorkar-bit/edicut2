import { z } from "zod";

const nodeApiEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  APP_URL: z.string().url().optional(),
  SERVICE_SHARED_SECRET: z.string().min(1).optional(),
});

export type NodeApiEnv = z.infer<typeof nodeApiEnvSchema>;

export function loadNodeApiEnv(source: Record<string, string | undefined>) {
  return nodeApiEnvSchema.parse(source);
}
