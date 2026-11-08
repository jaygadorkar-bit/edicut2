import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { parseDatabaseEnv } from "./env.js";

export type DatabaseClient = ReturnType<typeof drizzlePostgres<typeof schema>>;

type ClientCache = {
  url?: string;
  db?: DatabaseClient;
};

declare global {
  // eslint-disable-next-line no-var
  var __edicutDbCache: ClientCache | undefined;
}

function createDatabase(url: string): DatabaseClient {
  const host = new URL(url).hostname;
  const isLocalDatabase = ["localhost", "127.0.0.1", "[::1]"].includes(host);
  const isHyperdrive = host.endsWith(".hyperdrive.local");

  return drizzlePostgres(postgres(url, {
    // Hyperdrive supplies the production connection pool and terminates TLS to
    // Supabase. Keep its internal socket plain and use prepared statements;
    // Postgres.js prepare:false can hang with Hyperdrive transaction pooling.
    max: 1,
    prepare: true,
    ssl: isLocalDatabase || isHyperdrive ? false : "require",
    connect_timeout: 10,
    idle_timeout: 20,
    connection: {
      statement_timeout: 20_000,
      lock_timeout: 10_000,
    },
  }), { schema });
}

export function createCloudflareDb(envSource: Record<string, string | undefined>) {
  const { DATABASE_URL } = parseDatabaseEnv(envSource);
  // Hyperdrive owns the connection pool. Cloudflare recommends creating the
  // lightweight Postgres.js client per request instead of sharing sockets from
  // a module-global Worker isolate cache.
  return createDatabase(DATABASE_URL);
}

export function createNodeDb(envSource: Record<string, string | undefined>) {
  const { DATABASE_URL } = parseDatabaseEnv(envSource);
  return getCachedDatabase(DATABASE_URL);
}

function getCachedDatabase(url: string) {
  const cache = (globalThis.__edicutDbCache ??= {});

  if (cache.db && cache.url === url) {
    return cache.db;
  }

  const db = createDatabase(url);

  cache.url = url;
  cache.db = db;

  return db;
}
