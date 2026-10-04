// Integration checks use transaction-local copies of the real schema. No customer
// records are created or modified. Run inside the configured web container.
import { createRequire } from "node:module";
import type { DatabaseClient } from "../packages/db/src/client";
import { deleteUnpaidSubscription, markSubscriptionPaid, saveUnpaidSubscription } from "../apps/web/app/lib/customer-subscriptions.server";
const requireDb = createRequire(new URL("../packages/db/package.json", import.meta.url));
const { neon } = requireDb("@neondatabase/serverless");
const { drizzle } = requireDb("drizzle-orm/neon-http");
const { PgDialect } = requireDb("drizzle-orm/pg-core");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const query = neon(process.env.DATABASE_URL);
const realDb = drizzle(query);
const statements: Array<{ sql: string; params: unknown[] }> = [];
const push = (text: string) => statements.push({ sql: text, params: [] });
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const other = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const admin = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const updatedAt = "2026-10-03T12:00:00.000Z";
let couponCode: string | null = null;
function capture(builder: any): any {
  return new Proxy(builder, { get(target, property) {
    const method = target[property];
    if (typeof method !== "function") return method;
    return (...args: unknown[]) => {
      const next = method.apply(target, args);
      if (property === "returning" || property === "limit") {
        statements.push(next.toSQL());
        return Promise.resolve([{ id, couponCode }]);
      }
      return capture(next);
    };
  } });
}
const db = {
  insert: (table: unknown) => capture(realDb.insert(table)),
  update: (table: unknown) => capture(realDb.update(table)),
  select: () => capture(realDb.select()),
  execute: async (sql: unknown) => { statements.push(new PgDialect().sqlToQuery(sql)); return [{ id }]; },
} as unknown as DatabaseClient;
const assert = (condition: string, message: string) => push(`DO $test$ BEGIN IF NOT (${condition}) THEN RAISE EXCEPTION '${message}'; END IF; END $test$`);

push("CREATE TEMP TABLE customer_subscriptions (LIKE public.customer_subscriptions INCLUDING ALL) ON COMMIT DROP");
push("CREATE TEMP TABLE marketing_coupons (LIKE public.marketing_coupons INCLUDING ALL) ON COMMIT DROP");
push("SET LOCAL search_path = pg_temp, public");
// LIKE does not copy foreign keys, so these fixtures never need real users/admins.
const input = { ownerId: owner, packageSlug: "creator", planName: "Starter", country: "US", phone: "+12025550123", subtotalCents: 24900, discountCents: 0, amountCents: 24900 };
await saveUnpaidSubscription(db, input);
await saveUnpaidSubscription(db, { ...input, phone: "+12025550124" });
assert("(SELECT count(*) FROM pg_temp.customer_subscriptions) = 1", "Repeated checkout created duplicates");
assert("(SELECT phone FROM pg_temp.customer_subscriptions) = '+12025550124'", "Contact changes did not persist");
push(`UPDATE pg_temp.customer_subscriptions SET id = '${id}', updated_at = '${updatedAt}'`);
await deleteUnpaidSubscription(db, other, id);
assert("(SELECT deleted_at IS NULL FROM pg_temp.customer_subscriptions)", "Another owner deleted a subscription");
await markSubscriptionPaid(db, id, admin, "2026-10-03T11:00:00.000Z");
assert("(SELECT status FROM pg_temp.customer_subscriptions) = 'unpaid'", "A stale record was marked paid");
await markSubscriptionPaid(db, id, admin, updatedAt);
assert(`(SELECT status = 'paid' AND paid_by = '${admin}' AND paid_at IS NOT NULL FROM pg_temp.customer_subscriptions)`, "Payment audit fields were not saved");
await deleteUnpaidSubscription(db, owner, id);
assert("(SELECT deleted_at IS NULL FROM pg_temp.customer_subscriptions)", "A paid subscription was deleted");
await saveUnpaidSubscription(db, input);
assert("(SELECT count(*) FROM pg_temp.customer_subscriptions) = 2", "A paid plan blocked a new selection");
push(`UPDATE pg_temp.customer_subscriptions SET id = '${other}' WHERE status = 'unpaid'`);
await deleteUnpaidSubscription(db, owner, other);
assert(`(SELECT deleted_at IS NOT NULL FROM pg_temp.customer_subscriptions WHERE id = '${other}')`, "Unpaid deletion failed");
await saveUnpaidSubscription(db, input);
assert("(SELECT count(*) FROM pg_temp.customer_subscriptions) = 3", "Deleted selection blocked reselecting a plan");

push(`INSERT INTO pg_temp.marketing_coupons (code, discount_type, discount_value, max_redemptions) VALUES ('SAVE10', 'percent', 10, 1)`);
couponCode = "SAVE10";
await saveUnpaidSubscription(db, { ...input, packageSlug: "creator-plus", planName: "Growth", couponCode, subtotalCents: 54900, discountCents: 5490, amountCents: 49410 });
push(`UPDATE pg_temp.customer_subscriptions SET id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', updated_at = '${updatedAt}' WHERE coupon_code = 'SAVE10'`);
await markSubscriptionPaid(db, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", admin, updatedAt);
assert("(SELECT status FROM pg_temp.customer_subscriptions WHERE coupon_code = 'SAVE10') = 'paid'", "Discounted payment failed");
assert("(SELECT redemption_count FROM pg_temp.marketing_coupons WHERE code = 'SAVE10') = 1", "Coupon was not redeemed once");
await markSubscriptionPaid(db, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", admin, updatedAt);
assert("(SELECT redemption_count FROM pg_temp.marketing_coupons WHERE code = 'SAVE10') = 1", "Payment replay redeemed a coupon twice");
await saveUnpaidSubscription(db, { ...input, ownerId: other, packageSlug: "creator-plus", planName: "Growth", couponCode, subtotalCents: 54900, discountCents: 5490, amountCents: 49410 });
push(`UPDATE pg_temp.customer_subscriptions SET id = 'ffffffff-ffff-4fff-8fff-ffffffffffff', updated_at = '${updatedAt}' WHERE owner_id = '${other}'`);
await markSubscriptionPaid(db, "ffffffff-ffff-4fff-8fff-ffffffffffff", admin, updatedAt);
assert(`(SELECT status FROM pg_temp.customer_subscriptions WHERE owner_id = '${other}') = 'unpaid'`, "An exhausted coupon was redeemed");
// Constraints are checked in PL/pgSQL subtransactions so expected failures do not
// abort the remaining checks.
push(`DO $test$ BEGIN
  BEGIN UPDATE pg_temp.customer_subscriptions SET amount_cents = -1 WHERE id = '${id}'; RAISE EXCEPTION 'Invalid price accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE pg_temp.customer_subscriptions SET status = 'unpaid' WHERE id = '${id}'; RAISE EXCEPTION 'Invalid payment audit accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
END $test$`);
await query.transaction(statements.map(statement => query(statement.sql, statement.params)));
console.log("15 Postgres integration assertions passed using temporary tables. No customer data was changed.");
