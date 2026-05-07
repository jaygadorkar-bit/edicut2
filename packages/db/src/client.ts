import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";
import { parseDatabaseEnv } from "./env.js";

export type DatabaseClient =
  | ReturnType<typeof drizzle<typeof schema>>
  | ReturnType<typeof drizzlePostgres<typeof schema>>;

type ClientCache = {
  url?: string;
  db?: DatabaseClient;
};

declare global {
  // eslint-disable-next-line no-var
  var __edicutNodeDbCache: ClientCache | undefined;
}

function isNeonUrl(url: string) {
  return url.includes("neon.tech");
}

function createDatabase(url: string, fetchImpl?: typeof fetch): DatabaseClient {
  if (isNeonUrl(url) && fetchImpl) {
    neonConfig.fetchFunction = fetchImpl;
  }

  if (isNeonUrl(url)) {
    const sql = neon(url);

    return drizzle(sql, { schema });
  }

  return drizzlePostgres(postgres(url), { schema });
}

export function createCloudflareDb(envSource: Record<string, string | undefined>) {
  const { DATABASE_URL } = parseDatabaseEnv(envSource);

  return createDatabase(DATABASE_URL, fetch);
}

export function createNodeDb(envSource: Record<string, string | undefined>) {
  const { DATABASE_URL } = parseDatabaseEnv(envSource);
  const cache = (globalThis.__edicutNodeDbCache ??= {});

  if (cache.db && cache.url === DATABASE_URL) {
    return cache.db;
  }

  const db = createDatabase(DATABASE_URL);

  cache.url = DATABASE_URL;
  cache.db = db;

  return db;
}
