// Payment/role invalidations on the isolated local app and database only.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import postgres from "postgres";
const target = new URL(process.env.CHAT_TEST_DATABASE_URL ?? "postgresql://postgres:chat-test-local-only@127.0.0.1:55439/edicut_chat_test");
if (target.hostname !== "127.0.0.1" || target.port !== "55439" || target.pathname !== "/edicut_chat_test") throw new Error("Only the disposable chat test database is allowed");
const db = postgres(target.toString(), { onnotice: () => {} });
const web = createRequire(new URL("../apps/web/package.json", import.meta.url)), { WebSocket } = web("ws");
const origin = "http://localhost:3003", cookies = JSON.parse(await fs.readFile(new URL("../.codex-tmp/chat-test-sessions.json", import.meta.url), "utf8"));
const subscriptionId = "40000000-0000-4000-8000-000000000099", otherId = "10000000-0000-4000-8000-000000000002", managerId = "10000000-0000-4000-8000-000000000003";
let checks = 0; const sockets = [];
const check = (condition, label) => { assert.ok(condition, label); checks++; };
async function connect(actor) {
  const events = [], socket = new WebSocket(`${origin.replace("http", "ws")}/api/chat/socket?scope=${actor === "admin" ? "admin" : "client"}`, { headers: { Cookie: cookies[actor], Origin: origin } }); sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Isolated socket did not connect")), 5000);
    socket.on("message", data => { const event = JSON.parse(data.toString()); if (event.type === "ready") { clearTimeout(timeout); resolve(); } else events.push(event); });
    socket.once("error", error => { clearTimeout(timeout); reject(error); });
  });
  return events;
}
async function action(path, fields) {
  const response = await fetch(`${origin}${path}`, { method: "POST", headers: { Cookie: cookies.admin, Origin: origin }, body: new URLSearchParams(fields) });
  const text = await response.text(); check(response.status === 200, "Isolated admin mutation succeeds"); return text;
}
async function snapshot(actor) { return (await fetch(`${origin}/api/chat?scope=client&operation=sync`, { headers: { Cookie: cookies[actor] } })).json(); }
async function purchase(intent) {
  const [record] = await db`SELECT updated_at FROM customer_subscriptions WHERE id=${subscriptionId}`;
  return action("/site/node-logmin/subscriptions", { intent, subscriptionId, expectedUpdatedAt: record.updated_at.toISOString() });
}
const [manager] = await db`SELECT role FROM users WHERE id=${managerId}`;
try {
  await db`INSERT INTO customer_subscriptions (id,owner_id,package_slug,plan_name,purchase_type,country,phone,subtotal_cents,amount_cents,status)
    VALUES (${subscriptionId},${otherId},'isolated-access-test','Access event fixture','single','US','+12025550123',10900,10900,'unpaid')`;
  const other = await connect("otherClient"), admin = await connect("admin"), assigned = await connect("manager"), client = await connect("client"), support = await connect("support");
  const beforePaid = other.length, beforeAdmin = admin.length;
  check((await purchase("mark-paid")).includes("Payment recorded for this order."), "Paid purchase is confirmed");
  check(other.length > beforePaid && admin.length > beforeAdmin, "Payment pushes refreshes to customer and admin inbox");
  check((await snapshot("otherClient")).state.rooms.some(room => room.projectUnlocked), "Purchase unlocks the project snapshot immediately");
  const beforeUnpaid = other.length;
  check((await purchase("mark-unpaid")).includes("Paid access has been removed."), "Unpaid transition succeeds");
  check(other.length > beforeUnpaid, "Revoking payment pushes a refresh");
  check((await snapshot("otherClient")).state.rooms.every(room => !room.projectUnlocked), "Revoked purchase locks the project immediately");
  await purchase("mark-paid"); const beforeDelete = other.length;
  check((await purchase("delete-purchase")).includes("Order removed from the ledger."), "Removing the paid purchase succeeds");
  check(other.length > beforeDelete, "Purchase deletion pushes a refresh");
  check((await snapshot("otherClient")).state.rooms.every(room => !room.projectUnlocked), "Deleted purchase no longer unlocks chat");
  const beforeRole = assigned.length, beforeClient = client.length;
  check((await action("/site/node-logmin", { intent: "update-role", userId: managerId, role: "customer" })).includes("Role updated."), "Manager role change succeeds");
  check(assigned.length > beforeRole && client.length > beforeClient, "Role change invalidates former manager and affected customer");
  check(!(await snapshot("manager")).state.rooms.some(room => room.clientId === "10000000-0000-4000-8000-000000000001"), "Former manager loses the paid client's group");
  await action("/site/node-logmin", { intent: "update-role", userId: managerId, role: manager.role });
  check((await snapshot("manager")).state.rooms.some(room => room.clientId === "10000000-0000-4000-8000-000000000001"), "Restored role recovers current assignment access");
  const profileEvents = [other.length, admin.length, support.length];
  check((await action(`/site/node-logmin/users/${otherId}`, { intent: "save-profile", name: "Jamie Chen", email: "chat-fixture-1@example.test", role: "customer" })).includes("Account updated."), "Single-account profile update succeeds");
  check(other.length > profileEvents[0] && admin.length > profileEvents[1] && support.length > profileEvents[2], "Single-account profile changes refresh affected chat sessions");
  const deactivated = await fetch(`${origin}/api/chat?scope=client&operation=sync`, { headers: { Cookie: cookies.otherClient } });
  check([401, 403].includes(deactivated.status), "Deactivated customers lose chat access immediately");
  const inactiveEvents = [other.length, admin.length, support.length];
  check((await action(`/site/node-logmin/users/${otherId}`, { intent: "save-profile", name: "Jamie Chen", email: "chat-fixture-1@example.test", role: "customer", active: "on" })).includes("Account updated."), "Single-account reactivation succeeds");
  check(other.length > inactiveEvents[0] && admin.length > inactiveEvents[1] && support.length > inactiveEvents[2], "Reactivated accounts refresh the chat and support queues");
  const trashedEvents = [other.length, admin.length, support.length];
  await action(`/site/node-logmin/users/${otherId}`, { intent: "move-to-trash" });
  check(other.length > trashedEvents[0] && admin.length > trashedEvents[1] && support.length > trashedEvents[2], "Single-account trash invalidates open chat sessions");
  const trashed = await fetch(`${origin}/api/chat?scope=client&operation=sync`, { headers: { Cookie: cookies.otherClient } });
  check([401, 403].includes(trashed.status), "Trashed customers lose chat access immediately");
  const restoredEvents = [other.length, admin.length, support.length];
  await action(`/site/node-logmin/users/${otherId}`, { intent: "restore" });
  check(other.length > restoredEvents[0] && admin.length > restoredEvents[1] && support.length > restoredEvents[2], "Single-account restore invalidates chat and support queues");
  check([...other, ...admin, ...assigned, ...client, ...support].every(event => event.type === "refresh" && Object.keys(event).length === 1), "Access notices expose no identity or message content");
  console.log(`Live access invalidations verified: ${checks} checks passed on the disposable database.`);
} finally {
  for (const socket of sockets) socket.close();
  await db`UPDATE users SET role=${manager.role} WHERE id=${managerId}`;
  await db`UPDATE users SET active=true,deleted_at=NULL WHERE id=${otherId}`;
  await db`DELETE FROM customer_subscriptions WHERE id=${subscriptionId}`;
  await db.end();
}
