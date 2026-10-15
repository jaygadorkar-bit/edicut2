// Disposable database only. Never run fixtures against the site's live database.
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import postgres from "postgres";
const target = new URL(process.env.CHAT_TEST_DATABASE_URL ?? "postgresql://postgres:chat-test-local-only@127.0.0.1:55439/edicut_chat_test");
if (target.hostname !== "127.0.0.1" || target.port !== "55439" || target.pathname !== "/edicut_chat_test") throw new Error("Only the isolated chat test database is allowed.");
const db = postgres(target.toString());
try {
  const baseline = await fs.readFile(new URL("../supabase/migrations/20260822211748_edicut_initial_schema.sql", import.meta.url), "utf8");
  await db.unsafe(baseline.split("alter table public.users enable row level security;")[0]);
  const journal = JSON.parse(await fs.readFile(new URL("../packages/db/drizzle/meta/_journal.json", import.meta.url), "utf8"));
  await db.unsafe("CREATE SCHEMA IF NOT EXISTS drizzle; CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint)");
  const crypto = await import("node:crypto");
  const applied = await db`SELECT created_at FROM drizzle.__drizzle_migrations`;
  for (const migration of journal.entries) {
    if (applied.some(row => String(row.created_at) === String(migration.when))) continue;
    const source = await fs.readFile(new URL(`../packages/db/drizzle/${migration.tag}.sql`, import.meta.url), "utf8");
    await db.begin(async tx => { for (const statement of source.split("--> statement-breakpoint").filter(s => s.trim())) await tx.unsafe(statement); await tx`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${crypto.createHash("sha256").update(source).digest("hex")}, ${migration.when})`; });
  }
  const names = ["Alex Morgan", "Jamie Chen", "Maya Brooks", "Owen Reed", "Sofia Patel"];
  const roles = ["customer", "customer", "project_manager", "project_manager", "customer_support"];
  const ids = names.map((_,i) => `10000000-0000-4000-8000-${String(i+1).padStart(12, "0")}`);
  // Keep repeatable audit runs bounded and deterministic. These are the two
  // synthetic customer fixtures created below, never application accounts.
  const fixtureRoomIds = (await db`SELECT id FROM chat_rooms WHERE client_id IN ${db(ids.slice(0, 2))}`).map(room => room.id);
  if (fixtureRoomIds.length) {
    await db`DELETE FROM chat_reads WHERE room_id IN ${db(fixtureRoomIds)}`;
    await db`DELETE FROM chat_messages WHERE room_id IN ${db(fixtureRoomIds)}`;
    await db`DELETE FROM support_tickets WHERE room_id IN ${db(fixtureRoomIds)}`;
  }
  await db`DELETE FROM chat_rooms WHERE client_id IN ${db(ids.slice(0, 2))}`;
  for (const [i, name] of names.entries()) await db`INSERT INTO users (id, email, name, role) VALUES (${ids[i]}, ${`chat-fixture-${i}@example.test`}, ${name}, ${roles[i]}) ON CONFLICT (id) DO NOTHING`;
  const adminId = "20000000-0000-4000-8000-000000000001";
  await db`INSERT INTO admin_users (id, email, name, password_hash) VALUES (${adminId}, 'chat-admin@example.test', 'EdiCut Admin', 'test-cookie-auth-only') ON CONFLICT (id) DO NOTHING`;
  const teammateAdminIds = ["20000000-0000-4000-8000-000000000002", "20000000-0000-4000-8000-000000000003"];
  for (const [index, id] of teammateAdminIds.entries()) await db`INSERT INTO admin_users (id, email, name, password_hash) VALUES (${id}, ${`chat-admin-${index + 2}@example.test`}, ${`Admin teammate ${index + 2}`}, 'test-cookie-auth-only') ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO customer_subscriptions (id, owner_id, package_slug, plan_name, purchase_type, country, phone, subtotal_cents, amount_cents, status, paid_at, paid_by)
    VALUES ('40000000-0000-4000-8000-000000000001', ${ids[0]}, 'test-package', 'Isolated test package', 'single', 'US', '+12025550123', 10900, 10900, 'paid', now(), ${adminId}) ON CONFLICT (id) DO NOTHING`;
  for (const [i, id] of ids.slice(0,2).entries()) {
    await db`INSERT INTO chat_rooms (client_id, kind) VALUES (${id}, 'manager') ON CONFLICT (client_id) WHERE kind = 'manager' DO NOTHING`;
    const supportId = `30000000-0000-4000-8000-${String(i+1).padStart(12, '0')}`;
    await db`INSERT INTO chat_rooms (id, client_id, kind) VALUES (${supportId}, ${id}, 'support') ON CONFLICT (id) DO NOTHING`;
    await db`INSERT INTO support_tickets (room_id, subject, category) VALUES (${supportId}, 'Account question', 'account') ON CONFLICT (room_id) DO NOTHING`;
    await db`INSERT INTO chat_messages (room_id, actor_key, sender_user_id, sender_name, sender_role, body, client_nonce)
      VALUES (${supportId}, ${`user:${id}`}, ${id}, ${names[i]}, 'customer', 'Please help with my account.', ${supportId}) ON CONFLICT (actor_key, client_nonce) DO NOTHING`;
  }
  await db`UPDATE chat_rooms SET manager_id = ${ids[2]} WHERE client_id = ${ids[0]} AND kind = 'manager'`;
  const room = (await db`SELECT id FROM chat_rooms WHERE client_id = ${ids[0]} AND kind = 'manager'`)[0];
  if (!(await db`SELECT id FROM chat_messages WHERE room_id = ${room.id} LIMIT 1`).length) {
    const examples = [
      [ids[2], names[2], roles[2], "Hi Alex! I’m Maya, your project manager. This is where we can talk through your edits and keep everything moving."],
      [ids[0], names[0], roles[0], "Hi Maya 👋 I’m working on a new channel intro. Can we keep it quick and focus on the story?"],
      [ids[2], names[2], roles[2], "Absolutely. Send over your reference and any notes you have. We’ll confirm the approach together before the edit starts."],
      [ids[0], names[0], roles[0], "Perfect, I’ll share the brief today. Thank you!"],
    ];
    for (const [index, entry] of examples.entries()) await db`INSERT INTO chat_messages (room_id, actor_key, sender_user_id, sender_name, sender_role, body, client_nonce, created_at) VALUES (${room.id}, ${`user:${entry[0]}`}, ${entry[0]}, ${entry[1]}, ${entry[2]}, ${entry[3]}, ${crypto.randomUUID()}, ${new Date(Date.now() - (4-index)*60_000)})`;
    await db`UPDATE chat_rooms SET last_message_at = now(), updated_at = now(), last_message_preview = 'Perfect, I’ll share the brief today. Thank you!' WHERE id = ${room.id}`;
  }
  const requireWeb = createRequire(new URL("../apps/web/package.json", import.meta.url));
  const { createCookieSessionStorage } = requireWeb("react-router");
  const secret = "chat-test-session-local-only";
  async function sealFixtureSession(session, id, admin) {
    const [identity] = admin
      ? await db`SELECT id,email,password_hash,session_version FROM admin_users WHERE id = ${id}`
      : await db`SELECT id,email,password_hash,session_version FROM users WHERE id = ${id}`;
    if (!identity) throw new Error("Fixture identity is missing.");
    session.set("authExpiresAt", Date.now() + (admin ? 2 : 12) * 60 * 60 * 1000);
    session.set("authCredentialVersion", createHmac("sha256", secret)
      .update(JSON.stringify([admin ? "admin" : "user", identity.id, identity.email.trim().toLowerCase(), identity.password_hash ?? null, identity.session_version ?? null])).digest("base64url"));
  }
  const sessions = {};
  for (const [index, id] of [...ids, adminId].entries()) {
    const admin = index === ids.length;
    const storage = createCookieSessionStorage({ cookie: { name: admin ? "_edicut_admin" : "_session", path: "/", httpOnly: true, sameSite: "lax", secrets: [admin ? `${secret}:admin` : secret] } });
    const session = await storage.getSession(); session.set(admin ? "adminUserId" : "userId", id);
    await sealFixtureSession(session, id, admin);
    sessions[["client", "otherClient", "manager", "otherManager", "support", "admin"][index]] = (await storage.commitSession(session)).split(";")[0];
  }
  for (const [index, id] of teammateAdminIds.entries()) {
    const storage = createCookieSessionStorage({ cookie: { name: "_edicut_admin", path: "/", httpOnly: true, sameSite: "lax", secrets: [`${secret}:admin`] } });
    const session = await storage.getSession(); session.set("adminUserId", id);
    await sealFixtureSession(session, id, true);
    sessions[`admin${index + 2}`] = (await storage.commitSession(session)).split(";")[0];
  }
  await fs.mkdir(new URL("../.codex-tmp/", import.meta.url), { recursive: true });
  await fs.writeFile(new URL("../.codex-tmp/chat-test-sessions.json", import.meta.url), JSON.stringify(sessions));
  console.log("Isolated schema, migrations, five test users, admin, and sample conversation ready. No production data used.");
} finally { await db.end(); }
