// Read-only preview by default. Apply only after explicit production approval.
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { neon } = requireDb("@neondatabase/serverless");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const target = new URL(process.env.DATABASE_URL), args = process.argv.slice(2), apply = args.includes("--apply");
const argument = name => args[args.indexOf(name) + 1];
if (apply && (!args.includes("--expected-host") || !args.includes("--expected-database") || argument("--expected-host") !== target.hostname || argument("--expected-database") !== target.pathname.slice(1))) throw new Error("Applying requires the exact expected host and database.");
const query = neon(process.env.DATABASE_URL);
const directory = fileURLToPath(new URL("../packages/db/drizzle/", import.meta.url));
const journal = JSON.parse(fs.readFileSync(`${directory}/meta/_journal.json`, "utf8"));
const migrations = journal.entries.map(entry => { const source = fs.readFileSync(`${directory}/${entry.tag}.sql`, "utf8"); return { ...entry, hash:crypto.createHash("sha256").update(source).digest("hex"), statements:source.split("--> statement-breakpoint").filter(statement => statement.trim()) }; });
const applied = await query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at");
if (applied.some(row => !migrations.some(migration => migration.hash === row.hash && String(migration.when) === String(row.created_at)))) throw new Error("Migration history differs from this checkout. Inspect before applying.");
const pending = migrations.filter(migration => !applied.some(row => row.hash === migration.hash));
if (pending.some(migration => !["0011_dashboard-chat", "0012_chat-attachment-body", "0013_chat-read-cursors"].includes(migration.tag))) throw new Error("An unrelated migration is pending. Inspect before applying chat changes.");
console.log(JSON.stringify({ host:target.hostname, database:target.pathname.slice(1), pending:pending.map(m => m.tag), apply }));
if (apply && pending.length) {
  await query.transaction([query("SELECT pg_advisory_xact_lock(1790989172)"), ...pending.flatMap(migration => [...migration.statements.map(statement => query(statement)), query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",[migration.hash,migration.when])])]);
  console.log("Chat migrations applied atomically. Existing users and messages were not modified.");
}
