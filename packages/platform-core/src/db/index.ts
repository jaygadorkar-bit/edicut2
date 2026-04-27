import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { readEnv } from "../lib/env";

const connectionString =
  readEnv("DATABASE_URL") ??
  (process.env.NEXT_PHASE === "phase-production-build"
    ? "postgresql://build:build@127.0.0.1:5432/edicut_build"
    : undefined);

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined in the current environment.");
}

export const db = connectionString.includes("neon.tech")
  ? drizzleNeon(neon(connectionString), { schema })
  : drizzlePostgres(postgres(connectionString), { schema });
