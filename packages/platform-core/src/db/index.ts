import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { readEnv } from "../lib/env";

const connectionString =
  readEnv("SUPABASE_DATABASE_URL") ??
  (process.env.NEXT_PHASE === "phase-production-build"
    ? "postgresql://build:build@127.0.0.1:5432/edicut_build"
    : undefined);

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL is not defined in the current environment.");
}

const isLocalDatabase = ["localhost", "127.0.0.1", "[::1]"].includes(
  new URL(connectionString).hostname,
);

export const db = drizzlePostgres(
  postgres(connectionString, {
    max: 1,
    prepare: false,
    ssl: isLocalDatabase ? false : "require",
    connect_timeout: 10,
    idle_timeout: 20,
  }),
  { schema },
);
