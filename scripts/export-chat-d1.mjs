// Guarded read-only snapshot export. This never creates or writes a remote D1.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import postgres from "postgres";
import { chatD1Tables, chatD1Insert, chatD1Finalize, normalizeChatD1Row } from "./lib/chat-d1-export.mjs";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) {
  console.log("Read-only chat export: set CHAT_MIGRATION_DATABASE_URL, then supply --expected-host <host> --expected-database <database> --output <new directory under .codex-tmp/chat-d1/>. Imports require an empty staging database; see docs/chat-d1-migration.md.");
} else {
  try {
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      if (!["--expected-host", "--expected-database", "--output"].includes(args[index]) || !args[index + 1] || args[index + 1].startsWith("--") || options[args[index]]) throw new Error("Invalid export arguments");
      options[args[index]] = args[index + 1];
    }
    if (!Object.keys(options).every(key => typeof options[key] === "string") || Object.keys(options).length !== 3) throw new Error("All export arguments are required");
    const target = new URL(process.env.CHAT_MIGRATION_DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(target.protocol) || target.hostname !== options["--expected-host"] || decodeURIComponent(target.pathname.slice(1)) !== options["--expected-database"]) throw new Error("Database identity does not match the expected target");
    const workspace = fileURLToPath(new URL("../", import.meta.url)), allowedRoot = path.join(workspace, ".codex-tmp", "chat-d1");
    await fs.mkdir(allowedRoot, { recursive: true });
    const realRoot = await fs.realpath(allowedRoot), output = path.resolve(workspace, options["--output"]);
    const relative = path.relative(realRoot, output);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.dirname(output) !== realRoot) throw new Error("Choose a new direct child directory under .codex-tmp/chat-d1");
    await fs.mkdir(output, { mode: 0o700 }); // Refuse to overwrite an existing export.
    const dump = await fs.open(path.join(output, "data.sql"), "wx", 0o600);
    const db = postgres(target.toString(), { max: 1, prepare: false, onnotice: () => {} });
    const manifest = { schemaVersion: 1, snapshotAt: "", ticketSequence: 0, complete: false, tables: {}, sqlSha256: "" };
    const sqlHash = createHash("sha256");
    const write = async statement => { const line = `${statement}\n`; sqlHash.update(line); await dump.write(line); };
    try {
      await db.begin("isolation level repeatable read read only", async transaction => {
        const [time] = await transaction`SELECT transaction_timestamp() AS snapshot_at`;
        manifest.snapshotAt = time.snapshot_at.toISOString();
        const [sequence] = await transaction`SELECT last_value, is_called FROM support_tickets_ticket_number_seq`;
        manifest.ticketSequence = sequence.is_called ? Number(sequence.last_value) : 0;
        for (const table of chatD1Tables) {
          const digest = createHash("sha256"); let rows = 0;
          for await (const batch of transaction.unsafe(table.query).cursor(100)) {
            for (const row of batch) {
              digest.update(`${JSON.stringify(normalizeChatD1Row(table, row))}\n`);
              await write(chatD1Insert(table, row)); rows++;
            }
          }
          manifest.tables[table.name] = { rows, sha256: digest.digest("hex") };
        }
        for (const statement of chatD1Finalize(manifest.snapshotAt, manifest.ticketSequence)) await write(statement);
      });
      await dump.sync(); manifest.sqlSha256 = sqlHash.digest("hex"); manifest.complete = true;
      await fs.writeFile(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx", mode: 0o600 });
      console.log(`Read-only chat snapshot saved; ${Object.values(manifest.tables).reduce((sum, value) => sum + value.rows, 0)} rows. No remote database was modified.`);
    } finally { await dump.close(); await db.end(); }
  } catch (error) {
    // Provider errors can contain connection strings or customer SQL values.
    console.error(`Chat export did not complete (${error instanceof Error ? error.name : "unknown"}). Check arguments, database identity, and the runbook. Ignore any output without a complete manifest.`);
    process.exitCode = 1;
  }
}
