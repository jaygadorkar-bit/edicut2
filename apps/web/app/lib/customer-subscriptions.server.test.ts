import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DatabaseClient } from "@edicut/db/client";
import type { SQL } from "drizzle-orm";
import { adminSubscriptionsCsv, deleteAdminSubscription, deleteUnpaidSubscription, getLatestCustomerContact, getOwnedSubscription, isMissingCustomerSubscriptionSchema, isSameSiteMutation, listAdminSubscriptions, listAdminSubscriptionsForExport, listCustomerSubscriptions, markSubscriptionPaid, markSubscriptionUnpaid, readSubscriptionForm, saveUnpaidSubscription, subscriptionPage, subscriptionPaymentFilter } from "./customer-subscriptions.server";
import { CHECKOUT_COUNTRIES, validateCheckoutContact } from "./checkout-contact";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const admin = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const updatedAt = "2026-10-03T12:00:00.000Z";
function fakeDb(rows: unknown[] = [], selectRows: unknown[] = []) {
  const chain = {
    values: vi.fn().mockReturnThis(), onConflictDoUpdate: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(), innerJoin: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(),
    offset: vi.fn().mockResolvedValue(rows), limit: vi.fn().mockResolvedValue(selectRows), returning: vi.fn().mockResolvedValue(rows),
  };
  const raw = { insert: vi.fn(() => chain), update: vi.fn(() => chain), select: vi.fn(() => chain), execute: vi.fn().mockResolvedValue(rows) };
  return { db: raw as unknown as DatabaseClient, chain, raw };
}
const query = (value: SQL) => new PgDialect().sqlToQuery(value);

describe("checkout contact", () => {
  it("includes all country codes without duplicates", () => { expect(CHECKOUT_COUNTRIES).toHaveLength(249); expect(new Set(CHECKOUT_COUNTRIES.map(c => c.code)).size).toBe(249); });
  it("normalizes international numbers", () => expect(validateCheckoutContact("us", "+1 (202) 555-0123")).toEqual({ country: "US", phone: "+12025550123" }));
  it.each(["12345", "++12025550123", "+01234567", "+1234567890123456", "+1202extension123", "", "<script>"])("rejects malformed phone %s", phone => expect(validateCheckoutContact("US", phone)).toHaveProperty("error"));
  it("rejects unknown country codes", () => expect(validateCheckoutContact("XX", "+12025550123")).toHaveProperty("error"));
});

describe("subscription persistence protections", () => {
  it("detects a missing subscription migration without masking permission errors", () => {
    expect(isMissingCustomerSubscriptionSchema({
      message: 'Failed query: select from "customer_subscriptions"',
      cause: { code: "42P01", message: 'relation "customer_subscriptions" does not exist' },
    })).toBe(true);
    expect(isMissingCustomerSubscriptionSchema({
      code: "42501",
      message: "permission denied for table customer_subscriptions",
    })).toBe(false);
  });
  it("recognizes a missing column in a wrapped subscription query", () => {
    expect(isMissingCustomerSubscriptionSchema({
      message: 'Failed query: select "purchase_type" from "customer_subscriptions"',
      cause: { code: "42703", message: 'column "purchase_type" does not exist' },
    })).toBe(true);
    expect(isMissingCustomerSubscriptionSchema({
      message: 'Failed query: select "name" from "users"',
      cause: { code: "42703", message: 'column "name" does not exist' },
    })).toBe(false);
    expect(isMissingCustomerSubscriptionSchema({
      message: 'Failed query: select from "customer_subscriptions"',
      cause: { code: "42501", message: "permission denied" },
    })).toBe(false);
  });
  it("uses a database conflict target to reuse one unpaid selection per owner and plan", async () => {
    const { db, chain } = fakeDb([{ id }]);
    const input = { ownerId: owner, packageSlug: "creator", planName: "Starter", purchaseType: "monthly" as const, country: "US", phone: "+12025550123", subtotalCents: 54900, amountCents: 54900, discountCents: 0 };
    expect(await saveUnpaidSubscription(db, input)).toEqual({ id });
    expect(chain.values).toHaveBeenCalledWith(input);
    const conflict = chain.onConflictDoUpdate.mock.calls[0][0];
    expect(conflict.target).toHaveLength(2);
    expect(query(conflict.targetWhere).sql).toContain("'unpaid'");
    expect(query(conflict.targetWhere).sql).toContain('"deleted_at" IS NULL');
    expect(conflict.set).not.toHaveProperty("status");
  });
  it("reads payment only with id, owner, plan, and nondeleted filters", async () => {
    const { db, chain } = fakeDb([], [{ id }]);
    expect(await getOwnedSubscription(db, owner, id, "creator")).toEqual({ id });
    const compiled = query(chain.where.mock.calls[0][0]);
    expect(compiled.params).toEqual([id, owner, "creator"]);
    expect(compiled.sql).toContain('"deleted_at" is null');
  });
  it("loads the latest contact only from the authenticated owner's visible purchases", async () => {
    const contact = { country: "BD", phone: "+8801712345678" };
    const { db, chain } = fakeDb([], [contact]);
    expect(await getLatestCustomerContact(db, owner)).toEqual(contact);
    const compiled = query(chain.where.mock.calls[0][0]);
    expect(compiled.params).toEqual([owner]);
    expect(compiled.sql).toContain('"deleted_at" is null');
    expect(chain.orderBy).toHaveBeenCalled();
    expect(chain.limit).toHaveBeenCalledWith(1);
  });
  it("does not query invalid record ids", async () => {
    const { db, raw } = fakeDb();
    expect(await getOwnedSubscription(db, owner, "invalid", "creator")).toBeNull();
    expect(await deleteUnpaidSubscription(db, owner, "invalid")).toBe(false);
    expect(raw.select).not.toHaveBeenCalled(); expect(raw.update).not.toHaveBeenCalled();
  });
  it("deletes atomically only the requesting owner's unpaid record", async () => {
    const { db, chain } = fakeDb([{ id }]);
    expect(await deleteUnpaidSubscription(db, owner, id)).toBe(true);
    const compiled = query(chain.where.mock.calls[0][0]);
    expect(compiled.params).toEqual([id, owner, "unpaid"]);
    expect(chain.set.mock.calls[0][0].deletedAt).toBeInstanceOf(Date);
  });
  it("reports a paid, deleted, or foreign record as unavailable", async () => {
    const { db } = fakeDb(); expect(await deleteUnpaidSubscription(db, owner, id)).toBe(false);
  });
  it("records the admin and timestamp and checks the displayed revision before marking paid", async () => {
    const { db, chain } = fakeDb([{ id }], [{ id, couponCode: null }]);
    expect(await markSubscriptionPaid(db, id, admin, updatedAt)).toBe(true);
    expect(chain.set.mock.calls[0][0]).toMatchObject({ status: "paid", paidBy: admin, paidAt: expect.any(Date) });
    const compiled = query(chain.where.mock.calls[1][0]);
    expect(compiled.params).toEqual([id, "unpaid", updatedAt]);
    expect(compiled.sql).toContain('"coupon_code" is null');
  });
  it("rejects invalid timestamps and already paid/deleted/stale records", async () => {
    const { db, raw } = fakeDb();
    expect(await markSubscriptionPaid(db, id, admin, "yesterday")).toBe(false);
    expect(await markSubscriptionUnpaid(db, id, "yesterday")).toBe(false);
    expect(await deleteAdminSubscription(db, id, "yesterday")).toBe(false);
    expect(raw.select).not.toHaveBeenCalled();
    expect(raw.execute).not.toHaveBeenCalled();
    expect(await markSubscriptionPaid(db, id, admin, updatedAt)).toBe(false);
    expect(raw.update).not.toHaveBeenCalled();
  });
  it("redeems a coupon and changes status atomically without trusting client values", async () => {
    const { db, raw } = fakeDb([{ id }], [{ id, couponCode: "SAVE10" }]);
    expect(await markSubscriptionPaid(db, id, admin, updatedAt)).toBe(true);
    const compiled = query(raw.execute.mock.calls[0][0]);
    expect(compiled.sql).toContain("FOR UPDATE");
    expect(compiled.sql).toContain("c.redemption_count < c.max_redemptions");
    expect(compiled.sql).toContain("NOT EXISTS");
    expect(compiled.params).toEqual([id, updatedAt, admin]);
    expect(raw.update).not.toHaveBeenCalled();
  });
  it("reverts paid purchases only when their balance and project history are unused", async () => {
    const { db, raw } = fakeDb([{ id }]);
    expect(await markSubscriptionUnpaid(db, id, updatedAt)).toBe(true);
    const compiled = query(raw.execute.mock.calls[0][0]);
    expect(compiled.params).toEqual([id, updatedAt]);
    expect(compiled.sql).toContain("FOR UPDATE OF s");
    expect(compiled.sql).toContain("FOR UPDATE OF e");
    expect(compiled.sql).toContain("e.used_units > 0");
    expect(compiled.sql).toContain("project_intakes");
    expect(compiled.sql).toContain("redemption_count = c.redemption_count - 1");
    expect(compiled.sql).toContain("paid_at = NULL, paid_by = NULL");
    expect(raw.update).not.toHaveBeenCalled();
  });
  it("soft-deletes either payment state and releases only a safe paid coupon redemption", async () => {
    const { db, raw } = fakeDb([{ id }]);
    expect(await deleteAdminSubscription(db, id, updatedAt)).toBe(true);
    const compiled = query(raw.execute.mock.calls[0][0]);
    expect(compiled.params).toEqual([id, updatedAt]);
    expect(compiled.sql).toContain("deleted_at = now()");
    expect(compiled.sql).toContain("t.status = 'paid'");
    expect(compiled.sql).toContain("t.status = 'unpaid' OR t.coupon_code IS NULL");
    expect(compiled.sql).toContain("redemption_count = c.redemption_count - 1");
    expect(compiled.sql).toContain("FOR UPDATE OF e");
  });
  it("bounds list queries and scopes customer pagination to the owner", async () => {
    const { db, chain } = fakeDb();
    chain.limit.mockReturnValueOnce(chain as never);
    await listCustomerSubscriptions(db, owner, 2);
    expect(query(chain.where.mock.calls[0][0]).params).toEqual([owner]);
    expect(chain.limit).toHaveBeenCalledWith(26); expect(chain.offset).toHaveBeenCalledWith(25);
  });
  it("filters admin purchases by payment status before applying pagination", async () => {
    const { db, chain } = fakeDb();
    chain.limit.mockReturnValueOnce(chain as never);
    await listAdminSubscriptions(db, 3, "paid");
    const compiled = query(chain.where.mock.calls[0][0]);
    expect(compiled.params).toEqual(["paid"]); expect(compiled.sql).toContain('"status" =');
    expect(chain.limit).toHaveBeenCalledWith(26); expect(chain.offset).toHaveBeenCalledWith(50);
  });
  it("exports every nondeleted purchase for a requested payment status", async () => {
    const { db, chain } = fakeDb();
    await listAdminSubscriptionsForExport(db, "paid");
    const compiled = query(chain.where.mock.calls[0][0]);
    expect(compiled.params).toEqual(["paid"]); expect(compiled.sql).toContain('"deleted_at" is null');
    expect(chain.orderBy).toHaveBeenCalled(); expect(chain.limit).not.toHaveBeenCalled(); expect(chain.offset).not.toHaveBeenCalled();
  });
  it("exports all nondeleted purchases when no status is selected", async () => {
    const { db, chain } = fakeDb();
    await listAdminSubscriptionsForExport(db);
    const compiled = query(chain.where.mock.calls[0][0]);
    expect(compiled.params).toEqual([]);
    expect(compiled.sql).toContain('"deleted_at" is null');
    expect(compiled.sql).not.toContain('"status" =');
    expect(chain.orderBy).toHaveBeenCalled(); expect(chain.limit).not.toHaveBeenCalled(); expect(chain.offset).not.toHaveBeenCalled();
  });
  it("creates Excel-friendly CSV with escaped cells and formula-safe text", () => {
    const csv = adminSubscriptionsCsv([{
      subscription: {
        id, ownerId: owner, packageSlug: "creator", planName: '=HYPERLINK("https://example.test","Open")', purchaseType: "monthly",
        country: "BD", phone: "+8801712345678", addOns: [{ id: "thumbnail", label: "Custom thumbnail", amountCents: 2000 }],
        subtotalCents: 10400, discountCents: 0, amountCents: 10400, currency: "USD", couponCode: null,
        affiliateId: null, affiliateCode: null, affiliateCommissionBps: 0, status: "paid", paidAt: new Date("2026-10-04T00:00:00.000Z"), paidBy: admin,
        deletedAt: null, createdAt: new Date("2026-10-03T12:00:00.000Z"), updatedAt: new Date("2026-10-04T00:00:00.000Z"),
      },
      name: 'Ada, "Ace"\nName', email: "ada@example.test",
    }]);
    expect(csv.startsWith("\uFEFF\"Purchase ID\",\"Customer Name\"")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""https://example.test"",""Open"")"`);
    expect(csv).toContain(`"Ada, ""Ace""\nName"`);
    expect(csv).toContain("\"104.00\",\"USD\",\"paid\"");
    expect(csv).toContain("Custom thumbnail (20.00 USD)");
    expect(csv).toContain("2026-10-03T12:00:00.000Z");
  });
});

describe("mutation and pagination guards", () => {
  it("parses a normal URL-encoded POST", async () => {
    const form = await readSubscriptionForm(new Request("https://edicut.com/", { method: "POST", body: new URLSearchParams({ phone: "+12025550123" }) }), 4096);
    expect(form?.get("phone")).toBe("+12025550123");
  });
  it("enforces the actual body size without a Content-Length header", async () => {
    const request = new Request("https://edicut.com/", { method: "POST", body: new URLSearchParams({ phone: "1".repeat(5000) }) });
    expect(request.headers.has("Content-Length")).toBe(false);
    expect(await readSubscriptionForm(request, 4096)).toBeNull();
  });
  it("rejects unsupported methods and multipart uploads", async () => {
    expect(await readSubscriptionForm(new Request("https://edicut.com/"), 4096)).toBeNull();
    expect(await readSubscriptionForm(new Request("https://edicut.com/", { method: "POST", body: new FormData() }), 4096)).toBeNull();
  });
  it("rejects foreign origins and cross-site metadata", () => {
    expect(isSameSiteMutation(new Request("https://edicut.com/checkout", { method: "POST", headers: { Origin: "https://evil.com" } }))).toBe(false);
    expect(isSameSiteMutation(new Request("https://edicut.com/checkout", { method: "POST", headers: { "Sec-Fetch-Site": "cross-site" } }))).toBe(false);
    expect(isSameSiteMutation(new Request("https://edicut.com/checkout", { method: "POST", headers: { Origin: "https://edicut.com" } }))).toBe(true);
  });
  it.each(["0", "-1", "abc", "1e4", "99999999"])("defaults invalid page %s", page => expect(subscriptionPage(new Request(`https://edicut.com/?page=${page}`))).toBe(1));
  it.each([["", "unpaid"], ["status=paid", "paid"], ["status=unpaid", "unpaid"], ["status=other", "unpaid"]])("parses payment filter query %s", (queryString, expected) => {
    expect(subscriptionPaymentFilter(new Request(`https://edicut.com/?${queryString}`))).toBe(expected);
  });
});
