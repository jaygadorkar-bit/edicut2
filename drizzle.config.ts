import { config } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.join(repositoryRoot, ".env.local") });
config({ path: path.join(repositoryRoot, ".env") });

const databaseUrl = process.env.SUPABASE_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("Set SUPABASE_DATABASE_URL before running Drizzle migrations.");
}

export default {
  schema: "./packages/db/src/schema.ts",
  out: "./packages/db/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
};
