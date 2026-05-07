import { createCloudflareDb, createNodeDb } from "@edicut/db/client";

type EnvSource = Record<string, string | undefined>;

type DbContext = {
  cf?: { env?: EnvSource };
  cloudflare?: { env?: EnvSource };
};

export function getDbFromContext(context: DbContext) {
  const viteEnv = import.meta.env as EnvSource;
  const nodeEnv = globalThis.process?.env as EnvSource | undefined;
  const databaseUrl =
    context.cloudflare?.env?.DATABASE_URL ??
    context.cf?.env?.DATABASE_URL ??
    nodeEnv?.DATABASE_URL ??
    viteEnv.DATABASE_URL ??
    "postgresql://postgres:password@localhost:5432/edicut";

  const env = {
    ...context.cf?.env,
    ...context.cloudflare?.env,
    ...viteEnv,
    ...nodeEnv,
    DATABASE_URL: databaseUrl,
  };

  if (nodeEnv && !context.cloudflare?.env && !context.cf?.env) {
    return createNodeDb(env);
  }

  return createCloudflareDb(env);
}
