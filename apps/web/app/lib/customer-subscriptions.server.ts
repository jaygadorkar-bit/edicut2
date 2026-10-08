import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { customerSubscriptions as subscriptions, users } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";
import { hasReturnedRows } from "./db.server";
import { isWorkspaceRecordId } from "./workspace";
import { savedPackageAddOns } from "./package-addons";

export type CustomerSubscription = typeof subscriptions.$inferSelect;
export type SubscriptionPaymentFilter = "paid" | "unpaid";
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

export async function getLatestCustomerContact(db: DatabaseClient, ownerId: string) {
  const [contact] = await db.select({ country: subscriptions.country, phone: subscriptions.phone }).from(subscriptions)
    .where(and(eq(subscriptions.ownerId, ownerId), visible))
    .orderBy(desc(subscriptions.updatedAt), desc(subscriptions.createdAt), desc(subscriptions.id)).limit(1);
  return contact ?? null;
}

export function listAdminSubscriptions(db: DatabaseClient, page = 1, status: SubscriptionPaymentFilter = "unpaid") {
  return db.select({ subscription: subscriptions, name: users.name, email: users.email }).from(subscriptions)
    .innerJoin(users, eq(subscriptions.ownerId, users.id)).where(and(visible, eq(subscriptions.status, status)))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)).limit(26).offset((page - 1) * 25);
}

export function listAdminSubscriptionsForExport(db: DatabaseClient, status: SubscriptionPaymentFilter | "all" = "all") {
  return db.select({ subscription: subscriptions, name: users.name, email: users.email }).from(subscriptions)
    .innerJoin(users, eq(subscriptions.ownerId, users.id))
    .where(status === "all" ? visible : and(visible, eq(subscriptions.status, status)))
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id));
}

type AdminSubscriptionExportRow = { subscription: CustomerSubscription; name: string | null; email: string };

function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  const safeText = /^[\s\u0000-\u001F]*[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

export function adminSubscriptionsCsv(rows: AdminSubscriptionExportRow[]) {
  const columns = [
    "Order ID", "Customer Name", "Customer Email", "Plan", "Package", "Order Type",
    "Amount", "Currency", "Payment Status", "Country Code", "Phone", "Coupon Code",
    "Add-ons", "Selected At", "Paid At",
  ];
  const records = rows.map(({ subscription: record, name, email }) => {
    const addOns = savedPackageAddOns(record.addOns).map(item => `${item.label} (${(item.amountCents / 100).toFixed(2)} ${record.currency})`).join("; ");
    return [
      record.id, name, email, record.planName, record.packageSlug, record.purchaseType,
      (record.amountCents / 100).toFixed(2), record.currency, record.status, record.country,
      record.phone, record.couponCode, addOns, record.createdAt, record.paidAt,
    ];
  });
  return `\uFEFF${[columns, ...records].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
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

export async function markSubscriptionUnpaid(db: DatabaseClient, id: string, expectedUpdatedAt: string) {
  const expected = new Date(expectedUpdatedAt);
  if (!isWorkspaceRecordId(id) || Number.isNaN(expected.valueOf()) || expected.toISOString() !== expectedUpdatedAt) return false;
  // Lock the purchase and balance before checking for project work. Project
  // creation takes these locks in the same order, so a concurrent reservation
  // cannot slip between the safety check and this status change.
  const result = await db.execute(sql`
    WITH target AS MATERIALIZED (
      SELECT s.id, s.coupon_code FROM customer_subscriptions s
      WHERE s.id = ${id} AND s.status = 'paid' AND s.deleted_at IS NULL
        AND date_trunc('milliseconds', s.updated_at) = ${expected.toISOString()}::timestamptz
      FOR UPDATE OF s
    ), locked_entitlements AS MATERIALIZED (
      SELECT e.subscription_id, e.used_units FROM purchase_entitlements e
      JOIN target t ON t.id = e.subscription_id FOR UPDATE OF e
    ), released AS (
      UPDATE marketing_coupons c SET redemption_count = c.redemption_count - 1, updated_at = now()
      FROM target t WHERE c.code = t.coupon_code AND t.coupon_code IS NOT NULL AND c.redemption_count > 0
        AND NOT EXISTS (SELECT 1 FROM locked_entitlements e WHERE e.used_units > 0)
        AND NOT EXISTS (SELECT 1 FROM project_intakes p WHERE p.subscription_id = t.id)
      RETURNING c.code
    ), changed AS (
      UPDATE customer_subscriptions s SET status = 'unpaid', paid_at = NULL, paid_by = NULL, updated_at = now()
      FROM target t WHERE s.id = t.id
        AND NOT EXISTS (SELECT 1 FROM locked_entitlements e WHERE e.used_units > 0)
        AND NOT EXISTS (SELECT 1 FROM project_intakes p WHERE p.subscription_id = t.id)
        AND (t.coupon_code IS NULL OR EXISTS (SELECT 1 FROM released r WHERE r.code = t.coupon_code))
      RETURNING s.id
    ) SELECT id FROM changed
  `);
  return hasReturnedRows(result);
}

export async function deleteAdminSubscription(db: DatabaseClient, id: string, expectedUpdatedAt: string) {
  const expected = new Date(expectedUpdatedAt);
  if (!isWorkspaceRecordId(id) || Number.isNaN(expected.valueOf()) || expected.toISOString() !== expectedUpdatedAt) return false;
  // Keep the record for audit and foreign-key history. Paid coupon redemptions
  // are released only when the soft delete can safely remove customer access.
  const result = await db.execute(sql`
    WITH target AS MATERIALIZED (
      SELECT s.id, s.status, s.coupon_code FROM customer_subscriptions s
      WHERE s.id = ${id} AND s.deleted_at IS NULL
        AND date_trunc('milliseconds', s.updated_at) = ${expected.toISOString()}::timestamptz
      FOR UPDATE OF s
    ), locked_entitlements AS MATERIALIZED (
      SELECT e.subscription_id, e.used_units FROM purchase_entitlements e
      JOIN target t ON t.id = e.subscription_id FOR UPDATE OF e
    ), released AS (
      UPDATE marketing_coupons c SET redemption_count = c.redemption_count - 1, updated_at = now()
      FROM target t WHERE t.status = 'paid' AND c.code = t.coupon_code AND t.coupon_code IS NOT NULL AND c.redemption_count > 0
        AND NOT EXISTS (SELECT 1 FROM locked_entitlements e WHERE e.used_units > 0)
        AND NOT EXISTS (SELECT 1 FROM project_intakes p WHERE p.subscription_id = t.id)
      RETURNING c.code
    ), changed AS (
      UPDATE customer_subscriptions s SET status = 'unpaid', paid_at = NULL, paid_by = NULL, deleted_at = now(), updated_at = now()
      FROM target t WHERE s.id = t.id
        AND NOT EXISTS (SELECT 1 FROM locked_entitlements e WHERE e.used_units > 0)
        AND NOT EXISTS (SELECT 1 FROM project_intakes p WHERE p.subscription_id = t.id)
        AND (t.status = 'unpaid' OR t.coupon_code IS NULL OR EXISTS (SELECT 1 FROM released r WHERE r.code = t.coupon_code))
      RETURNING s.id
    ) SELECT id FROM changed
  `);
  return hasReturnedRows(result);
}

// Mutating browser requests must originate on this site. Form submissions from
// older clients without an Origin still honor Fetch Metadata when present.
export { isSameSiteMutation } from "./mutation-request.server";

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

export function subscriptionPaymentFilter(request: Request): SubscriptionPaymentFilter {
  return new URL(request.url).searchParams.get("status") === "paid" ? "paid" : "unpaid";
}
