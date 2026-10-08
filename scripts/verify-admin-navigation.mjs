// Real HTTP/DB verification using only the disposable local fixture app.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import postgres from "postgres";

const target = new URL(process.env.CHAT_TEST_DATABASE_URL ?? "postgresql://postgres:chat-test-local-only@127.0.0.1:55439/edicut_chat_test");
if (target.hostname !== "127.0.0.1" || target.port !== "55439" || target.pathname !== "/edicut_chat_test") throw new Error("Only the isolated test database is allowed.");
const db = postgres(target.toString());
const origin = "http://127.0.0.1:3003";
const cookies = JSON.parse(await fs.readFile(new URL("../.codex-tmp/chat-test-sessions.json", import.meta.url), "utf8"));
const admin = "20000000-0000-4000-8000-000000000001";
const owner = "10000000-0000-4000-8000-000000000001";
const orderIds = Array.from({ length: 5 }, (_, i) => `30000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
const enquiryIds = Array.from({ length: 5 }, (_, i) => `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
async function counts(actor = "admin") {
  return fetch(`${origin}/site/node-logmin/navigation-counts`, { headers: { Cookie: cookies[actor] ?? "" }, redirect: "manual" });
}
async function orderAction(intent, id) {
  const [record] = await db`SELECT updated_at FROM customer_subscriptions WHERE id = ${id}`;
  return fetch(`${origin}/site/node-logmin/subscriptions`, {
    method: "POST", headers: { Cookie: cookies.admin, Origin: origin },
    body: new URLSearchParams({ intent, subscriptionId: id, expectedUpdatedAt: record.updated_at.toISOString() }),
  });
}
async function resetFixtures() {
  for (const [i, id] of orderIds.entries()) {
    const paid = i === 3, deleted = i === 4;
    await db`INSERT INTO customer_subscriptions (id, owner_id, package_slug, plan_name, purchase_type, country, phone, subtotal_cents, amount_cents, status, paid_at, paid_by, deleted_at)
      VALUES (${id}, ${owner}, ${`nav-fixture-${i}`}, ${["Creator Video", "Studio Video", "Feature Video", "Creator Monthly", "Removed order"][i]}, 'single', 'US', '+12025550123', ${(i + 1) * 10900}, ${(i + 1) * 10900}, ${paid ? "paid" : "unpaid"}, ${paid ? new Date() : null}, ${paid ? admin : null}, ${deleted ? new Date() : null})
      ON CONFLICT (id) DO UPDATE SET status = excluded.status, paid_at = excluded.paid_at, paid_by = excluded.paid_by, deleted_at = excluded.deleted_at, updated_at = now()`;
  }
  for (const [i, id] of enquiryIds.entries()) {
    await db`INSERT INTO contact_messages (id, name, email, message, status, replied_at)
      VALUES (${id}, ${`Preview client ${i + 1}`}, ${`nav-fixture-${i}@example.test`}, 'Local preview enquiry', ${i === 3 ? "read" : i === 4 ? "replied" : "new"}, ${i === 4 ? new Date() : null})
      ON CONFLICT (id) DO UPDATE SET status = excluded.status, replied_at = excluded.replied_at, updated_at = now()`;
  }
}
try {
  await resetFixtures();
  const response = await counts();
  check(response.status === 200, "Admin can read counts");
  check(response.headers.get("Cache-Control") === "no-store", "Private counts are never cached");
  const initial = await response.json();
  const [expected] = await db`SELECT
    (SELECT count(*)::int FROM customer_subscriptions WHERE deleted_at IS NULL AND status = 'unpaid') AS orders,
    (SELECT count(*)::int FROM contact_messages WHERE replied_at IS NULL AND status <> 'read') AS enquiries`;
  check(initial.pendingOrderCount === expected.orders && initial.unreadEnquiryCount === expected.enquiries, "Counts match actual visible pending orders and unread enquiries");
  check(initial.pendingOrderCount >= 3 && initial.unreadEnquiryCount >= 3, "Real pending/read/replied/deleted fixtures are present");
  for (const actor of ["anonymous", "client", "manager", "support"]) check((await counts(actor)).status === 403, `${actor} cannot read admin counts`);
  check((await orderAction("mark-paid", orderIds[0])).ok, "Real order confirmation action succeeds");
  check((await (await counts()).json()).pendingOrderCount === initial.pendingOrderCount - 1, "Payment confirmation decreases the badge");
  await orderAction("mark-unpaid", orderIds[0]);
  check((await (await counts()).json()).pendingOrderCount === initial.pendingOrderCount, "Reopened pending order restores the count");
  await orderAction("delete-purchase", orderIds[1]);
  check((await (await counts()).json()).pendingOrderCount === initial.pendingOrderCount - 1, "Removed order is excluded");
  await fetch(`${origin}/dashboard/messages`, {
    method: "POST", headers: { Cookie: cookies.admin, Origin: origin },
    body: new URLSearchParams({ intent: "mark-read", messageIds: enquiryIds[0] }),
  });
  check((await (await counts()).json()).unreadEnquiryCount === initial.unreadEnquiryCount - 1, "Reading an enquiry decreases the badge");
  await db`UPDATE admin_users SET active = false WHERE id = ${admin}`;
  check((await counts()).status === 403, "An inactive admin cookie cannot expose counts");
  await db`UPDATE admin_users SET active = true WHERE id = ${admin}`;
  const document = await (await fetch(`${origin}/site/node-logmin/subscriptions`, { headers: { Cookie: cookies.admin } })).text();
  check(document.includes("Orders | EdiCut Admin") && document.includes("Order ledger"), "Orders page uses consistent naming");
  const csv = await fetch(`${origin}/site/node-logmin/subscriptions/export`, { headers: { Cookie: cookies.admin } });
  check(csv.headers.get("Content-Disposition") === 'attachment; filename="orders.csv"', "Export filename uses Orders");
  check((await csv.text()).includes('"Order ID"'), "CSV header uses Order ID");
  console.log(`${checks} real admin notification checks passed. Only the disposable local database was modified.`);
} finally {
  await db`UPDATE admin_users SET active = true WHERE id = ${admin}`;
  await resetFixtures();
  await db.end();
}
