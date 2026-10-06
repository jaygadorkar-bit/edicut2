// Run inside the configured web container so this uses the site's database.
// Preview by default. Applying requires explicitly naming the expected target.
import fs from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { neon } = requireDb("@neondatabase/serverless");
const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required.");
const target = new URL(connection);
const args = process.argv.slice(2);
const argument = name => args[args.indexOf(name) + 1];
const apply = args.includes("--apply");
if (apply && (!args.includes("--expected-host") || !args.includes("--expected-database")
  || argument("--expected-host") !== target.hostname || argument("--expected-database") !== target.pathname.slice(1))) {
  throw new Error("Applying requires an exact --expected-host and --expected-database match.");
}
const query = neon(connection);
const directory = fileURLToPath(new URL("../packages/db/drizzle/", import.meta.url));
const journal = JSON.parse(fs.readFileSync(`${directory}/meta/_journal.json`, "utf8"));
const migrations = journal.entries.map(entry => {
  const source = fs.readFileSync(`${directory}/${entry.tag}.sql`, "utf8");
  return { ...entry, hash: crypto.createHash("sha256").update(source).digest("hex"), statements: source.split("--> statement-breakpoint").map(part => part.trim()).filter(Boolean) };
});
const applied = await query("SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at");
for (const existing of applied) {
  if (!migrations.some(item => item.hash === existing.hash && String(item.when) === String(existing.created_at))) {
    throw new Error("Database migration history differs from this checkout. Inspect before applying.");
  }
}
const pending = migrations.filter(item => !applied.some(existing => existing.hash === item.hash));
if (pending.some(item => !["0007_add_purchase_type", "0008_package_add_ons", "0009_custom_quotes", "0010_client-project-intake"].includes(item.tag))) {
  throw new Error("An unexpected migration is pending. Inspect the database migration history before applying.");
}
console.log(JSON.stringify({ host: target.hostname, database: target.pathname.slice(1), pending: pending.map(item => item.tag), apply }));
if (apply && pending.length) {
  await query.transaction([
    query("SELECT pg_advisory_xact_lock(1790989172)"),
    ...pending.flatMap(item => [
      ...item.statements.map(statement => query(statement)),
      query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)", [item.hash, item.when]),
    ]),
  ]);
  console.log("Database migrations applied atomically.");
}
