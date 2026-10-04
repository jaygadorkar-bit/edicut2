import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { customerSubscriptions as subscriptions, users } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";
import { hasReturnedRows } from "./db.server";
import { isWorkspaceRecordId } from "./workspace";

export type CustomerSubscription = typeof subscriptions.$inferSelect;
export type SubscriptionInput = Pick<typeof subscriptions.$inferInsert, "ownerId" | "packageSlug" | "planName" | "addOns" | "country" | "phone" | "subtotalCents" | "discountCents" | "amountCents" | "couponCode" | "affiliateId" | "affiliateCode" | "affiliateCommissionBps"> & {
  purchaseType: "single" | "monthly";
};
const visible = isNull(subscriptions.deletedAt);

export function isMissingCustomerSubscriptionSchema(error: unknown) {
  const seen = new Set<object>();
  let subscriptionContext = false;
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const detail = current as { code?: unknown; message?: unknown; cause?: unknown };
    const message = typeof detail.message === "string" ? detail.message : "";
    subscriptionContext ||= /customer_subscriptions/i.test(message);
    if (/customer_subscriptions/i.test(message)
      && (detail.code === "42P01" || /does not exist|undefined table|undefined column/i.test(message))) return true;
    if (detail.code === "42703" && subscriptionContext) return true;
    current = detail.cause;
  }
  return false;
}

export async function saveUnpaidSubscription(db: DatabaseClient, input: SubscriptionInput) {
  const [saved] = await db.insert(subscriptions).values(input).onConflictDoUpdate({
    target: [subscriptions.ownerId, subscriptions.packageSlug],
    targetWhere: sql`${subscriptions.status} = 'unpaid' AND ${subscriptions.deletedAt} IS NULL`,
    set: { ...input, updatedAt: new Date() },
  }).returning();
  return saved;
}

export async function getOwnedSubscription(db: DatabaseClient, ownerId: string, id: string, packageSlug: string) {
  if (!isWorkspaceRecordId(id)) return null;
  const [record] = await db.select().from(subscriptions).where(and(
    eq(subscriptions.id, id), eq(subscriptions.ownerId, ownerId), eq(subscriptions.packageSlug, packageSlug), visible,
  )).limit(1);
  return record ?? null;
}

export function listCustomerSubscriptions(db: DatabaseClient, ownerId: string, page = 1) {
  return db.select().from(subscriptions).where(and(eq(subscriptions.ownerId, ownerId), visible))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)).limit(26).offset((page - 1) * 25);
}

export function listAdminSubscriptions(db: DatabaseClient, page = 1) {
  return db.select({ subscription: subscriptions, name: users.name, email: users.email }).from(subscriptions)
    .innerJoin(users, eq(subscriptions.ownerId, users.id)).where(visible)
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)).limit(26).offset((page - 1) * 25);
}

export async function deleteUnpaidSubscription(db: DatabaseClient, ownerId: string, id: string) {
  if (!isWorkspaceRecordId(id)) return false;
  const result = await db.update(subscriptions).set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.ownerId, ownerId), eq(subscriptions.status, "unpaid"), visible))
    .returning();
  return hasReturnedRows(result);
}

export async function markSubscriptionPaid(db: DatabaseClient, id: string, adminId: string, expectedUpdatedAt: string) {
  const expected = new Date(expectedUpdatedAt);
  if (!isWorkspaceRecordId(id) || Number.isNaN(expected.valueOf()) || expected.toISOString() !== expectedUpdatedAt) return false;
  // Compare at millisecond precision because JS Dates cannot retain Postgres's
  // microseconds. This guard prevents confirming a changed contact/price record.
  const unchanged = sql`date_trunc('milliseconds', ${subscriptions.updatedAt}) = ${expected.toISOString()}::timestamptz`;
  const [record] = await db.select().from(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.status, "unpaid"), unchanged, visible)).limit(1);
  if (!record) return false;
  if (record.couponCode) {
    // Redeem and record payment in one statement. A failed status transition or
    // uniqueness constraint rolls back the coupon counter as well.
    const result = await db.execute(sql`
      WITH target AS MATERIALIZED (
        SELECT * FROM customer_subscriptions WHERE id = ${id} AND status = 'unpaid' AND deleted_at IS NULL
          AND date_trunc('milliseconds', updated_at) = ${expected.toISOString()}::timestamptz FOR UPDATE
      ), redeemed AS (
        UPDATE marketing_coupons c SET redemption_count = c.redemption_count + 1, updated_at = now()
        FROM target t WHERE c.code = t.coupon_code AND c.active = true
          AND (c.starts_at IS NULL OR c.starts_at <= now()) AND (c.expires_at IS NULL OR c.expires_at > now())
          AND (c.max_redemptions IS NULL OR c.redemption_count < c.max_redemptions)
          AND NOT EXISTS (SELECT 1 FROM customer_subscriptions p WHERE p.owner_id = t.owner_id AND p.coupon_code = t.coupon_code AND p.status = 'paid')
          AND NOT EXISTS (SELECT 1 FROM workspace_projects p WHERE p.owner_id = t.owner_id AND p.coupon_id = c.id)
        RETURNING c.code
      ) UPDATE customer_subscriptions s SET status = 'paid', paid_at = now(), paid_by = ${adminId}, updated_at = now()
        FROM target t, redeemed r WHERE s.id = t.id AND s.coupon_code = r.code RETURNING s.id
    `);
    return hasReturnedRows(result);
  }
  const result = await db.update(subscriptions).set({ status: "paid", paidAt: new Date(), paidBy: adminId, updatedAt: new Date() })
    .where(and(eq(subscriptions.id, id), eq(subscriptions.status, "unpaid"), isNull(subscriptions.couponCode), unchanged, visible))
    .returning();
  return hasReturnedRows(result);
}

// Mutating browser requests must originate on this site. Form submissions from
// older clients without an Origin still honor Fetch Metadata when present.
export function isSameSiteMutation(request: Request) {
  const origin = request.headers.get("Origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("Sec-Fetch-Site") !== "cross-site";
}

export async function readSubscriptionForm(request: Request, maximumBytes: number): Promise<FormData | null> {
  if (request.method !== "POST" || !request.headers.get("Content-Type")?.toLowerCase().startsWith("application/x-www-form-urlencoded") || !request.body) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const form = new FormData();
    for (const [key, value] of new URLSearchParams(text)) form.append(key, value);
    return form;
  } finally { reader.releaseLock(); }
}

export function subscriptionPage(request: Request) {
  const value = new URL(request.url).searchParams.get("page") ?? "1";
  return /^[1-9]\d{0,4}$/.test(value) ? Number(value) : 1;
}
