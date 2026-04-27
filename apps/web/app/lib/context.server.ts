import type { DatabaseClient } from "@edicut/db";
import { createCloudflareDb } from "@edicut/db";
import { z } from "zod";

const webEnvSchema = z.object({
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(32),
  SERVICE_SHARED_SECRET: z.string().min(32).optional(),
  NODE_API_BASE_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export type WebLoadContext = {
  cf: {
    env: Record<string, string | undefined>;
    ctx: ExecutionContext;
  };
  env: WebEnv;
  db: DatabaseClient;
};

function readProcessEnv() {
  // Local preview paths in this repo do not always inject Worker env vars, so
  // provide safe localhost defaults when running outside the Cloudflare context.
  return {
    APP_URL: process.env.APP_URL ?? "http://127.0.0.1:4174",
    DATABASE_URL:
      process.env.DATABASE_URL ?? "postgresql://postgres:password@127.0.0.1:5432/edicut",
    SESSION_SECRET:
      process.env.SESSION_SECRET ?? "stage9-local-session-secret-stage9-local-session",
    SERVICE_SHARED_SECRET: process.env.SERVICE_SHARED_SECRET,
    NODE_API_BASE_URL: process.env.NODE_API_BASE_URL ?? "http://127.0.0.1:8787",
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

function readEnvWithFallback(env?: Record<string, string | undefined>) {
  return {
    ...readProcessEnv(),
    ...env,
  };
}

export function createWebLoadContext(args: {
  env: Record<string, string | undefined>;
  ctx: ExecutionContext;
}): WebLoadContext {
  const env = webEnvSchema.parse(readEnvWithFallback(args.env));

  return {
    cf: {
      env: args.env,
      ctx: args.ctx,
    },
    env,
    db: createCloudflareDb(env),
  };
}

export function resolveWebEnv(context?: Pick<WebLoadContext, "env">) {
  return context?.env ?? webEnvSchema.parse(readEnvWithFallback());
}

export function resolveWebDb(context?: Pick<WebLoadContext, "env" | "db">) {
  if (context?.db) {
    return context.db;
  }

  return createCloudflareDb(resolveWebEnv(context));
}
