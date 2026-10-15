// Read-only remote parity check. Customer rows stay in memory; only counts and
// checksum results are printed. Never print provider errors or response bodies.
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { chatD1Tables, normalizeChatD1Row } from "./lib/chat-d1-export.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)), account = "f2c46bb116722bcb7dc4be44e500154b";
const args = process.argv.slice(2), fields = ["--database-id", "--expected-name", "--export"];
if (args.length !== 6 || fields.some(field => args.filter(value => value === field).length !== 1)) throw new Error("Use --database-id <UUID> --expected-name <name> --export <private export directory>");
const get = key => args[args.indexOf(key) + 1], database = get("--database-id"), name = get("--expected-name");
if (!/^[0-9a-f-]{36}$/.test(database) || !/^edicut-chat-(staging|production)$/.test(name)) throw new Error("Choose a verified EdiCut chat database");
const allowed = await fs.realpath(path.join(root, ".codex-tmp/chat-d1")), output = await fs.realpath(path.resolve(root, get("--export")));
if (path.dirname(output) !== allowed) throw new Error("Export must be directly under .codex-tmp/chat-d1");
const manifest = JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8"));
if (manifest.complete !== true || manifest.schemaVersion !== 1) throw new Error("Expected a complete schema-v1 export");
const hash = createHash("sha256"); for await (const chunk of createReadStream(path.join(output, "data.sql"))) hash.update(chunk);
if (hash.digest("hex") !== manifest.sqlSha256) throw new Error("Export SQL checksum differs");
const token = dotenv.parse(await fs.readFile(path.join(root, ".env"), "utf8")).CLOUDFLARE_MASTER_API_TOKEN;
if (!token) throw new Error("Local Cloudflare master token is unavailable");
async function api(suffix = "", body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}${suffix}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  const result = await response.json();
  if (!response.ok || result.success !== true) throw new Error(`Cloudflare D1 read failed (HTTP ${response.status})`);
  return result.result;
}
async function query(sql, params = []) {
  const results = await api("/query", { sql, params });
  if (results.length !== 1 || !results[0].success) throw new Error("D1 parity query failed");
  return results[0].results;
}
const metadata = await api();
if (metadata.uuid !== database || metadata.name !== name) throw new Error("D1 account/database identity differs");
let checks = 0;
for (const table of chatD1Tables) {
  const digest = createHash("sha256"), keys = table.name === "chat_reads" ? ["room_id", "actor_key"] : [table.columns[0]];
  let count = 0, cursor;
  while (true) {
    const where = cursor ? `WHERE (${keys.join(",")}) > (${keys.map(() => "?").join(",")})` : "";
    const rows = await query(`SELECT ${table.columns.join(",")}${table.name === "chat_messages" ? ",search_body,search_attachment" : table.name === "chat_rooms" ? ",search_preview" : table.name === "support_tickets" ? ",search_subject" : ""} FROM ${table.name} ${where} ORDER BY ${keys.join(",")} LIMIT 500`, cursor ?? []);
    for (const row of rows) {
      if (table.name === "chat_messages" && (row.search_body !== row.body.toLowerCase() || row.search_attachment !== (row.attachment ? JSON.parse(row.attachment).name.toLowerCase() : ""))) throw new Error("Derived Unicode search values differ");
          if (table.name === "chat_rooms" && row.search_preview !== (row.last_message_preview ?? "").toLowerCase()) throw new Error("Derived room search differs");
          if (table.name === "support_tickets" && row.search_subject !== row.subject.toLowerCase()) throw new Error("Derived ticket search differs");
      digest.update(`${JSON.stringify(normalizeChatD1Row(table, row))}\n`); count++;
    }
    if (rows.length < 500) break;
    cursor = keys.map(key => rows.at(-1)[key]);
  }
  if (count !== manifest.tables[table.name]?.rows || digest.digest("hex") !== manifest.tables[table.name]?.sha256) throw new Error(`${table.name} parity differs`);
  checks += 2; console.log(`${table.name}: ${count} rows; checksum matched`);
}
if ((await query("PRAGMA foreign_key_check")).length) throw new Error("D1 contains dangling references"); checks++;
const migration = (await query("SELECT * FROM chat_migration_metadata WHERE id=1"))[0];
if (migration?.schema_version !== 1 || migration?.snapshot_at !== manifest.snapshotAt || migration?.source_ticket_sequence !== manifest.ticketSequence) throw new Error("Migration metadata differs"); checks++;
if ((await query("SELECT seq FROM sqlite_sequence WHERE name='support_tickets'"))[0]?.seq < manifest.ticketSequence) throw new Error("Ticket sequence is behind the source"); checks++;
console.log(`Remote ${name} verified: ${checks} parity checks passed; no remote writes performed.`);
