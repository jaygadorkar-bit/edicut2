// Read-only preview by default. Apply only after explicit production approval.
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const postgres = requireDb("postgres");
if (!process.env.SUPABASE_DATABASE_URL) throw new Error("SUPABASE_DATABASE_URL is required.");
const target = new URL(process.env.SUPABASE_DATABASE_URL), args = process.argv.slice(2), apply = args.includes("--apply");
const argument = name => args[args.indexOf(name) + 1];
if (apply && (!args.includes("--expected-host") || !args.includes("--expected-database") || argument("--expected-host") !== target.hostname || argument("--expected-database") !== target.pathname.slice(1))) throw new Error("Applying requires the exact expected host and database.");
const sql = postgres(process.env.SUPABASE_DATABASE_URL, { max: 1, connect_timeout: 10, connection: { statement_timeout: 30000, lock_timeout: 5000 } });
const directory = fileURLToPath(new URL("../packages/db/drizzle/", import.meta.url));
const journal = JSON.parse(fs.readFileSync(`${directory}/meta/_journal.json`, "utf8"));
const migrations = journal.entries.map(entry => { const source = fs.readFileSync(`${directory}/${entry.tag}.sql`, "utf8"); return { ...entry, hash:crypto.createHash("sha256").update(source).digest("hex"), statements:source.split("--> statement-breakpoint").filter(statement => statement.trim()) }; });
try {
const applied = await sql.unsafe("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at");
if (applied.some(row => !migrations.some(migration => migration.hash === row.hash && String(migration.when) === String(row.created_at)))) throw new Error("Migration history differs from this checkout. Inspect before applying.");
const pending = migrations.filter(migration => !applied.some(row => row.hash === migration.hash));
if (pending.some(migration => !["0011_dashboard-chat", "0012_chat-attachment-body", "0013_chat-read-cursors", "0014_support-tickets"].includes(migration.tag))) throw new Error("An unrelated migration is pending. Inspect before applying chat changes.");
console.log(JSON.stringify({ host:target.hostname, database:target.pathname.slice(1), pending:pending.map(m => m.tag), apply }));
if (apply && pending.length) {
    await sql.begin(async tx => {
      await tx.unsafe("SELECT pg_advisory_xact_lock(1790989172)");
      for (const migration of pending) {
        for (const statement of migration.statements) await tx.unsafe(statement);
        await tx.unsafe("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [migration.hash, migration.when]);
      }
    });
    console.log("Chat migrations applied atomically. Existing users and messages were preserved; existing support history was linked to tickets.");
}
} finally { await sql.end(); }
