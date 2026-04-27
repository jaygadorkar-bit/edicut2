import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import { parseDatabaseEnv } from "./env.js";

export type DatabaseClient = ReturnType<typeof drizzle<typeof schema>>;

type ClientCache = {
  url?: string;
  db?: DatabaseClient;
};

declare global {
  // eslint-disable-next-line no-var
  var __edicutNodeDbCache: ClientCache | undefined;
}

function createDatabase(url: string, fetchImpl?: typeof fetch) {
  if (fetchImpl) {
    neonConfig.fetchFunction = fetchImpl;
  }

  const sql = neon(url);

  return drizzle(sql, { schema });
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
