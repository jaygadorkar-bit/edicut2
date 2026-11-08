import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: "../../.env.local" });
config({ path: "../../.env" });

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Set SUPABASE_DATABASE_URL before running Drizzle migrations.");
}

export default defineConfig({
  // Keep legacy package scripts pointed at the active app schema and migration journal.
  schema: "../db/src/schema.ts",
  out: "../db/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
