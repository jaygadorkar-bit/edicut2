// Read-only by default. Run in the web container to use its configured database.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

class MigrationSafetyError extends Error {}

export function readAuthSessionMigrations() {
  const directory = new URL("../packages/db/drizzle/", import.meta.url);
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", directory), "utf8"));
  return journal.entries.map(entry => {
    const source = readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8");
    return { ...entry, hash: createHash("sha256").update(source).digest("hex"), statements: source.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean) };
  });
}

export function getAuthSessionMigrationPlan(applied, migrations) {
  if (applied.some(row => !migrations.some(item => item.hash === row.hash && String(item.when) === String(row.created_at)))) {
    throw new MigrationSafetyError("Database migration history differs from this checkout. Inspect before applying.");
  }
  if (!migrations.some(item => item.tag === "0015_auth_session_revocation")) {
    throw new MigrationSafetyError("The auth-session migration is missing from this checkout.");
  }
  const pending = migrations.filter(item => !applied.some(row => row.hash === item.hash));
  if (pending.some(item => item.tag !== "0015_auth_session_revocation")) {
    throw new MigrationSafetyError("An unrelated migration is pending. This script only applies auth-session revocation.");
  }
  return pending;
}

export function verifyAuthSessionTarget(connection, options) {
  if (!connection) throw new MigrationSafetyError("DATABASE_URL is required.");
  const target = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new MigrationSafetyError("A PostgreSQL database is required.");
  if (options.apply && (options["expected-host"] !== target.hostname || options["expected-database"] !== target.pathname.slice(1))) {
    throw new MigrationSafetyError("Applying requires an exact --expected-host and --expected-database match.");
  }
  return { host: target.hostname, database: target.pathname.slice(1) };
}

async function columns(sql) {
  return sql`SELECT table_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('users', 'admin_users') AND column_name = 'session_version'
    ORDER BY table_name`;
}

function verifyColumns(rows) {
  if (rows.length !== 2 || rows.some(row => row.data_type !== "uuid" || row.is_nullable !== "NO" || !row.column_default?.includes("gen_random_uuid()"))) {
    throw new MigrationSafetyError("Session-version columns do not match the application schema.");
  }
}

export async function migrateAuthSessions(connection, options = {}) {
  const target = verifyAuthSessionTarget(connection, options);
  const migrations = readAuthSessionMigrations();
  const sql = postgres(connection, { max: 1, connect_timeout: 10, connection: { statement_timeout: 30_000, lock_timeout: 5_000 } });
  try {
    if (!options.apply) {
      const pending = getAuthSessionMigrationPlan(await sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`, migrations);
      const result = { ...target, apply: false, pending: pending.map(item => item.tag), columns: await columns(sql) };
      if (!pending.length) verifyColumns(result.columns);
      return result;
    }
    return await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(1790989172)`;
      const pending = getAuthSessionMigrationPlan(await tx`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`, migrations);
      for (const migration of pending) {
        for (const statement of migration.statements) await tx.unsafe(statement);
        await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.when})`;
      }
      const result = { ...target, apply: true, applied: pending.map(item => item.tag), columns: await columns(tx) };
      verifyColumns(result.columns);
      return result;
    });
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { apply: { type: "boolean", default: false }, "expected-host": { type: "string" }, "expected-database": { type: "string" } } });
    console.log(JSON.stringify(await migrateAuthSessions(process.env.DATABASE_URL, values)));
  } catch (error) {
    // Driver errors can contain SQL, credentials, and row data.
    console.error(error instanceof MigrationSafetyError ? error.message : "Auth-session migration failed. Inspect the database connection and schema privately.");
    process.exitCode = 1;
  }
}
