// Read-only by default. Apply only to an explicitly confirmed database target.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

class MigrationSafetyError extends Error {}
const tag = "0016_project_intake_pending_hours";

export function pendingHoursMigrationPlan(applied, migrations) {
  if (applied.some(row => !migrations.some(item => item.hash === row.hash && String(item.when) === String(row.created_at)))) {
    throw new MigrationSafetyError("Database migration history differs from this checkout. Inspect before applying.");
  }
  if (!migrations.some(item => item.tag === tag)) throw new MigrationSafetyError("Pending-hours migration is missing.");
  const pending = migrations.filter(item => !applied.some(row => row.hash === item.hash));
  if (pending.some(item => item.tag !== tag)) throw new MigrationSafetyError("An unrelated migration is pending. Apply it separately first.");
  return pending;
}

export async function migrateProjectPendingHours(connection, options = {}) {
  if (!connection) throw new MigrationSafetyError("DATABASE_URL is required.");
  const target = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new MigrationSafetyError("A PostgreSQL database is required.");
  if (options.apply && (options["expected-host"] !== target.hostname || options["expected-database"] !== target.pathname.slice(1))) {
    throw new MigrationSafetyError("Applying requires an exact --expected-host and --expected-database match.");
  }
  const directory = new URL("../packages/db/drizzle/", import.meta.url);
  const journal = JSON.parse(readFileSync(new URL("meta/_journal.json", directory), "utf8"));
  const migrations = journal.entries.map(entry => {
    const source = readFileSync(new URL(`${entry.tag}.sql`, directory), "utf8");
    return { ...entry, hash: createHash("sha256").update(source).digest("hex"), statements: source.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean) };
  });
  const sql = postgres(connection, { max: 1, connect_timeout: 10, connection: { statement_timeout: 30_000, lock_timeout: 5_000 } });
  const inspect = async tx => {
    const pending = pendingHoursMigrationPlan(await tx`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`, migrations);
    const checks = await tx`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'public.project_intakes'::regclass AND conname = 'project_intakes_reserved_check'`;
    if (checks.length !== 1 || !checks[0].definition.includes(pending.length ? "reserved_units > 0" : "reserved_units >= 0")) {
      throw new MigrationSafetyError("Reservation constraint does not match migration history. Inspect before applying.");
    }
    return pending;
  };
  try {
    if (!options.apply) return { host: target.hostname, database: target.pathname.slice(1), apply: false, pending: (await inspect(sql)).map(item => item.tag) };
    return await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(1790989172)`;
      const pending = await inspect(tx);
      for (const migration of pending) {
        for (const statement of migration.statements) await tx.unsafe(statement);
        await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.when})`;
      }
      await inspect(tx);
      return { host: target.hostname, database: target.pathname.slice(1), apply: true, applied: pending.map(item => item.tag) };
    });
  } finally { await sql.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { apply: { type: "boolean", default: false }, "expected-host": { type: "string" }, "expected-database": { type: "string" } } });
    console.log(JSON.stringify(await migrateProjectPendingHours(process.env.DATABASE_URL, values)));
  } catch (error) {
    console.error(error instanceof MigrationSafetyError ? error.message : "Project migration failed. Inspect the connection and schema privately.");
    process.exitCode = 1;
  }
}
