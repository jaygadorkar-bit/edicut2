import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DatabaseClient } from "@edicut/db/client";
import type { SQL } from "drizzle-orm";
import { deleteUnpaidSubscription, getOwnedSubscription, isMissingCustomerSubscriptionSchema, isSameSiteMutation, listCustomerSubscriptions, markSubscriptionPaid, readSubscriptionForm, saveUnpaidSubscription, subscriptionPage } from "./customer-subscriptions.server";
import { CHECKOUT_COUNTRIES, validateCheckoutContact } from "./checkout-contact";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const owner = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const admin = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const updatedAt = "2026-10-03T12:00:00.000Z";
function fakeDb(rows: unknown[] = [], selectRows: unknown[] = []) {
  const chain = {
    values: vi.fn().mockReturnThis(), onConflictDoUpdate: vi.fn().mockReturnThis(), set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(), orderBy: vi.fn().mockReturnThis(),
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
    expect(raw.select).not.toHaveBeenCalled();
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
  it("bounds list queries and scopes customer pagination to the owner", async () => {
    const { db, chain } = fakeDb();
    chain.limit.mockReturnValueOnce(chain as never);
    await listCustomerSubscriptions(db, owner, 2);
    expect(query(chain.where.mock.calls[0][0]).params).toEqual([owner]);
    expect(chain.limit).toHaveBeenCalledWith(26); expect(chain.offset).toHaveBeenCalledWith(25);
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
    expect(isSameSiteMutation(new Request("https://edicut.com/checkout", { headers: { Origin: "https://evil.com" } }))).toBe(false);
    expect(isSameSiteMutation(new Request("https://edicut.com/checkout", { headers: { "Sec-Fetch-Site": "cross-site" } }))).toBe(false);
    expect(isSameSiteMutation(new Request("https://edicut.com/checkout", { headers: { Origin: "https://edicut.com" } }))).toBe(true);
  });
  it.each(["0", "-1", "abc", "1e4", "99999999"])("defaults invalid page %s", page => expect(subscriptionPage(new Request(`https://edicut.com/?page=${page}`))).toBe(1));
});
