import { z } from "zod";

const nodeApiEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  SERVICE_SHARED_SECRET: z.string().min(32),
  APP_URL: z.string().url().optional(),
});

export type NodeApiEnv = z.infer<typeof nodeApiEnvSchema>;

export function loadNodeApiEnv(source: Record<string, string | undefined>) {
  return nodeApiEnvSchema.parse(source);
}
