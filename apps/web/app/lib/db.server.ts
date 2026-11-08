import { createCloudflareDb, createNodeDb } from "@edicut/db/client";

type StringEnvSource = Record<string, string | undefined>;
type RuntimeEnv = {
  [key: string]: unknown;
  DATABASE_URL?: string;
  SUPABASE_DATABASE_URL?: string;
  SUPABASE_HYPERDRIVE?: { connectionString?: string };
};

type DbContext = {
  cf?: { env?: RuntimeEnv };
  cloudflare?: { env?: RuntimeEnv };
};

type RuntimeSources = {
  nodeEnv?: StringEnvSource;
  viteEnv?: StringEnvSource;
};

const cloudflareDatabaseClients = new WeakMap<object, { url: string; db: ReturnType<typeof createCloudflareDb> }>();

function isLocalDatabaseUrl(value: string | undefined): value is string {
  if (!value) return false;

  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** Resolve only an explicit Supabase endpoint; never fall back to a legacy hosted URL. */
export function getDatabaseUrlFromContext(
  context: DbContext,
  sources: RuntimeSources = {
    nodeEnv: globalThis.process?.env as StringEnvSource | undefined,
    viteEnv: import.meta.env as StringEnvSource,
  },
) {
  const cloudflareEnv = context.cloudflare?.env ?? context.cf?.env;
  if (cloudflareEnv) {
    const url =
      cloudflareEnv.SUPABASE_HYPERDRIVE?.connectionString ??
      cloudflareEnv.SUPABASE_DATABASE_URL;

    if (!url) {
      throw new Error("Supabase Postgres is not configured for this Cloudflare Worker.");
    }

    return url;
  }

  const url =
    sources.nodeEnv?.SUPABASE_DATABASE_URL ??
    sources.viteEnv?.SUPABASE_DATABASE_URL;
  if (url) return url;

  const localDatabaseUrl = sources.nodeEnv?.DATABASE_URL ?? sources.viteEnv?.DATABASE_URL;
  if (isLocalDatabaseUrl(localDatabaseUrl)) return localDatabaseUrl;

  throw new Error(
    "Supabase Postgres is not configured. Set SUPABASE_HYPERDRIVE or SUPABASE_DATABASE_URL.",
  );
}

export function getDbFromContext(context: DbContext) {
  const nodeEnv = globalThis.process?.env as StringEnvSource | undefined;
  const databaseUrl = getDatabaseUrlFromContext(context);
  const env = { DATABASE_URL: databaseUrl };

  if (nodeEnv && !context.cloudflare?.env && !context.cf?.env) {
    return createNodeDb(env);
  }

  const requestContext = context as object;
  const cached = cloudflareDatabaseClients.get(requestContext);
  if (cached?.url === databaseUrl) return cached.db;

  const db = createCloudflareDb(env);
  cloudflareDatabaseClients.set(requestContext, { url: databaseUrl, db });
  return db;
}

export function hasReturnedRows(result: unknown) {
  if (Array.isArray(result)) return result.length > 0;
  if (!result || typeof result !== "object" || !("rows" in result)) return false;
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) && rows.length > 0;
}
