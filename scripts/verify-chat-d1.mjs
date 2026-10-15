// Run the D1 staging schema and import checks in disposable local workerd only.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { chatD1Tables, chatD1Insert, chatD1Finalize, normalizeChatD1Row } from "./lib/chat-d1-export.mjs";

const web = createRequire(new URL("../apps/web/package.json", import.meta.url)), runtime = createRequire(web.resolve("wrangler"));
const { Miniflare, convertV4MiniflareOptions } = runtime("miniflare");
const app = new Miniflare(convertV4MiniflareOptions({ name: "chat-d1-local-verification", modules: true, compatibilityDate: "2026-04-19", script: "export default { fetch() { return new Response('Local verification only', { status: 404 }); } };", d1Databases: { CHAT_D1: "chat-d1-local-verification" } }));
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const table = name => chatD1Tables.find(value => value.name === name);
const at = "2026-10-09T00:00:00.123Z";
try {
  const db = await app.getD1Database("CHAT_D1");
  const source = (await Promise.all(["0001_chat.sql", "0002_chat_search.sql","0003_chat_room_search.sql"].map(name => fs.readFile(new URL(`../packages/db/d1/chat/${name}`, import.meta.url), "utf8")))).join("\n");
  const schema = source.split("\n").filter(line => !line.trim().startsWith("--")).join(" ").split(";").map(value => value.trim()).filter(Boolean);
  await db.batch(schema.map(statement => db.prepare(statement)));
  check((await db.prepare("PRAGMA foreign_keys").first("foreign_keys")) === 1, "D1 enforces foreign keys");

  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== "--export") throw new Error("Use --export <ignored export directory>");
    const { default: path } = await import("node:path"), { fileURLToPath } = await import("node:url");
    const root = await fs.realpath(fileURLToPath(new URL("../.codex-tmp/chat-d1/", import.meta.url))), output = await fs.realpath(path.resolve(args[1]));
    if (path.dirname(output) !== root) throw new Error("Only exports directly under .codex-tmp/chat-d1 are allowed");
    const manifest = JSON.parse(await fs.readFile(path.join(output, "manifest.json"), "utf8")), sqlFile = path.join(output, "data.sql");
    check(manifest.complete === true && manifest.schemaVersion === 1, "Export is complete and has the expected schema version");
    const fileHash = createHash("sha256");
    for await (const chunk of createReadStream(sqlFile)) fileHash.update(chunk);
    check(fileHash.digest("hex") === manifest.sqlSha256, "SQL export checksum matches");
    let statements = [];
    for await (const statement of createInterface({ input: createReadStream(sqlFile), crlfDelay: Infinity })) {
      if (statement) statements.push(db.prepare(statement));
      if (statements.length === 50) { await db.batch(statements); statements = []; }
    }
    if (statements.length) await db.batch(statements);
    for (const mapping of chatD1Tables) {
      const digest = createHash("sha256"); let count = 0, cursor;
      const keys = mapping.name === "chat_reads" ? ["room_id", "actor_key"] : [mapping.columns[0]];
      while (true) {
        const where = cursor ? `WHERE (${keys.join(",")}) > (${keys.map(() => "?").join(",")})` : "";
        const query = db.prepare(`SELECT ${mapping.columns.join(",")}${mapping.name === "chat_messages" ? ",search_body,search_attachment" : mapping.name === "chat_rooms" ? ",search_preview" : mapping.name === "support_tickets" ? ",search_subject" : ""} FROM ${mapping.name} ${where} ORDER BY ${keys.join(",")} LIMIT 500`);
        const rows = (await (cursor ? query.bind(...cursor) : query).all()).results;
        for (const row of rows) {
          if (mapping.name === "chat_messages" && (row.search_body !== row.body.toLowerCase() || row.search_attachment !== (row.attachment ? JSON.parse(row.attachment).name.toLowerCase() : ""))) throw new Error("Derived Unicode search values differ");
          if (mapping.name === "chat_rooms" && row.search_preview !== (row.last_message_preview ?? "").toLowerCase()) throw new Error("Derived room search differs");
          if (mapping.name === "support_tickets" && row.search_subject !== row.subject.toLowerCase()) throw new Error("Derived ticket search differs");
          digest.update(`${JSON.stringify(normalizeChatD1Row(mapping, row))}\n`); count++;
        }
        if (rows.length < 500) break;
        cursor = keys.map(key => rows.at(-1)[key]);
      }
      check(count === manifest.tables[mapping.name]?.rows, `${mapping.name} row count matches`);
      check(digest.digest("hex") === manifest.tables[mapping.name]?.sha256, `${mapping.name} content checksum matches`);
    }
    check(!(await db.prepare("PRAGMA foreign_key_check").all()).results.length, "All imported foreign keys are intact");
    check((await db.prepare("SELECT source_ticket_sequence FROM chat_migration_metadata").first("source_ticket_sequence")) === manifest.ticketSequence, "Ticket sequence is preserved");
    check((await db.prepare("SELECT seq FROM sqlite_sequence WHERE name='support_tickets'").first("seq")) >= manifest.ticketSequence, "The actual next ticket sequence honors the source high-water mark");
  } else {
    const fixture = {
      users: [{ id: "client", email: "client@example.test", name: "Alex", role: "customer", active: true, deleted_at: null, password_hash: "DO_NOT_EXPORT_SECRET" }, { id: "manager", email: "manager@example.test", name: "Maya", role: "project_manager", active: true, deleted_at: null }],
      admin_users: [{ id: "admin", email: "admin@example.test", name: "Admin", role: "admin", active: true }],
      chat_client_access: [{ client_id: "client", project_unlocked: true }, { client_id: "manager", project_unlocked: false }],
      chat_rooms: [{ id: "project", client_id: "client", kind: "manager", manager_id: "manager", last_message_at: at, last_message_preview: "Message", created_at: at, updated_at: at }, { id: "ticket", client_id: "client", kind: "support", manager_id: null, last_message_at: null, last_message_preview: null, created_at: at, updated_at: at }],
      chat_messages: [1, 2].map(index => ({ id: `message-${index}`, room_id: "project", actor_key: "admin:admin", sender_user_id: null, sender_admin_id: "admin", sender_name: "Admin", sender_role: "admin", body: "It's a message; DROP TABLE users;\nবাংলা 😊", attachment: index === 2 ? { publicId: "edicut/chat/private", name: "Customer's file.pdf", mime: "application/pdf", bytes: 100 } : null, edited_at: null, deleted_at: null, client_nonce: `nonce-${index}`, created_at: at })),
      chat_reads: [{ room_id: "project", actor_key: "user:client", last_read_at: at, last_read_id: "message-1" }],
      support_tickets: [{ room_id: "ticket", ticket_number: 7, subject: "Billing question", category: "billing", priority: "normal", status: "waiting_support", closed_at: null, closed_by: null, updated_at: at }],
    };
    const statements = chatD1Tables.flatMap(mapping => fixture[mapping.name].map(row => chatD1Insert(mapping, row)));
    check(!statements.join("\n").includes("DO_NOT_EXPORT_SECRET"), "Only allowed identity fields are exported");
    await db.batch([...statements, ...chatD1Finalize(at, 42)].map(statement => db.prepare(statement)));
    check((await db.prepare("SELECT body FROM chat_messages WHERE id = 'message-1'").first("body")) === fixture.chat_messages[0].body, "Unicode, quotes, newlines and SQL-looking text survive exactly");
    check((await db.prepare("SELECT active FROM users WHERE id = 'client'").first("active")) === 1, "Booleans are converted to SQLite integers");
    check(JSON.parse(await db.prepare("SELECT attachment FROM chat_messages WHERE id = 'message-2'").first("attachment")).name === "Customer's file.pdf", "Private attachment metadata survives import");
    check((await db.prepare("SELECT count(*) AS count FROM chat_messages msg JOIN chat_reads rd ON rd.room_id = msg.room_id WHERE (msg.created_at,msg.id) > (rd.last_read_at,rd.last_read_id)").first("count")) === 1, "Tied timestamp read cursors remain ordered by ID");
    await assert.rejects(db.prepare("INSERT INTO chat_rooms SELECT 'duplicate',client_id,kind,manager_id,last_message_at,last_message_preview,created_at,updated_at FROM chat_rooms WHERE id='project'").run()); checks++;
    await assert.rejects(db.prepare("INSERT INTO chat_messages SELECT 'duplicate',room_id,actor_key,sender_user_id,sender_admin_id,sender_name,sender_role,body,attachment,edited_at,deleted_at,client_nonce,created_at FROM chat_messages WHERE id='message-1'").run()); checks++;
    await assert.rejects(db.batch([db.prepare("UPDATE users SET name='Should roll back' WHERE id='client'"), db.prepare("UPDATE support_tickets SET status='closed' WHERE room_id='ticket'")])); checks++;
    check((await db.prepare("SELECT name FROM users WHERE id='client'").first("name")) === "Alex", "A failed D1 batch rolls back prior changes");
    await db.prepare("INSERT INTO chat_rooms (id,client_id,kind,created_at,updated_at) VALUES ('next-ticket','client','support',?,?)").bind(at, at).run();
    await db.prepare("INSERT INTO support_tickets (room_id,subject,category,updated_at) VALUES ('next-ticket','Next ticket','other',?)").bind(at).run();
    check((await db.prepare("SELECT ticket_number FROM support_tickets WHERE room_id='next-ticket'").first("ticket_number")) === 43, "New ticket numbers continue beyond the source sequence, including deleted numbers");
    await assert.rejects(db.prepare("INSERT INTO chat_reads (room_id,actor_key,last_read_at) VALUES ('missing','user:client',?)").bind(at).run()); checks++;
    check(!(await db.prepare("PRAGMA foreign_key_check").all()).results.length, "Synthetic import has no dangling references");
    check((await db.prepare("EXPLAIN QUERY PLAN SELECT id FROM chat_messages WHERE room_id='project' ORDER BY created_at,id LIMIT 50").all()).results.some(row => String(row.detail).includes("chat_messages_room_created_idx")), "History reads use the room/cursor index");
    assert.throws(() => chatD1Insert(table("users"), { ...fixture.users[0], name: "null\0byte" })); checks++;
  }
  console.log(`D1 preparation verified locally: ${checks} checks passed; no Cloudflare resources or production data were changed.`);
} finally { await app.dispose(); }
