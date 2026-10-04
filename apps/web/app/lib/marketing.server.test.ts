import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
import {
  calculateCouponDiscount,
  calculateCommissionCents,
  combineAffiliateMetrics,
  isMissingMarketingSchema,
  getAffiliatePortalData,
  normalizeMarketingCode,
  parseCommissionRateBps,
  parseCouponDate,
} from "./marketing.server";

describe("missing marketing schema detection", () => {
  it("recognizes a missing table wrapped by Drizzle", () => {
    const cause = { code: "42P01", message: 'relation "marketing_coupons" does not exist' };
    expect(isMissingMarketingSchema({ message: 'Failed query: select from "marketing_coupons"', cause })).toBe(true);
    expect(isMissingMarketingSchema({ cause: { cause } })).toBe(true);
  });

  it("recognizes missing affiliate tables and project marketing columns", () => {
    expect(isMissingMarketingSchema({ code: "42P01", message: 'relation "marketing_affiliates" does not exist' })).toBe(true);
    expect(isMissingMarketingSchema({ code: "42703", message: 'column workspace_projects.coupon_id does not exist' })).toBe(true);
  });

  it("does not hide permission, connection, or unrelated schema failures", () => {
    expect(isMissingMarketingSchema({ message: 'Failed query: select from "marketing_coupons"', cause: { code: "42501", message: "permission denied for table marketing_coupons" } })).toBe(false);
    expect(isMissingMarketingSchema({ code: "42P01", message: 'relation "users" does not exist' })).toBe(false);
    expect(isMissingMarketingSchema(new Error("Connection unavailable"))).toBe(false);
  });

  it("handles non-errors and cyclic causes", () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(isMissingMarketingSchema(cyclic)).toBe(false);
    expect(isMissingMarketingSchema(null)).toBe(false);
  });
});

describe("marketing code normalization", () => {
  it("normalizes valid codes and rejects malformed ones", () => {
    expect(normalizeMarketingCode("  summer_25 ")).toBe("SUMMER_25");
    expect(normalizeMarketingCode("ab")).toBeNull();
    expect(normalizeMarketingCode("bad code")).toBeNull();
  });
});

describe("coupon discount calculation", () => {
  it("rounds percentage discounts down to whole cents", () => {
    expect(calculateCouponDiscount(10_001, "percent", 15)).toBe(1_500);
  });

  it("caps a fixed discount at the estimate and rejects invalid amounts", () => {
    expect(calculateCouponDiscount(2_500, "fixed", 10_000)).toBe(2_500);
    expect(calculateCouponDiscount(0, "fixed", 500)).toBe(0);
  });
});

describe("affiliate commission reporting", () => {
  it("uses the captured basis-point rate and rounds to whole cents", () => {
    expect(calculateCommissionCents(10_001, 1_250)).toBe(1_250);
    expect(calculateCommissionCents(null, 1_250)).toBe(0);
    expect(calculateCommissionCents(-100, 1_250)).toBe(0);
    expect(calculateCommissionCents(10_000, 10_001)).toBe(0);
  });

  it("combines project and subscription totals without multiplying rows", () => {
    expect(combineAffiliateMetrics(
      ["partner-a", "partner-b"],
      [{ affiliateId: "partner-a", referralCount: 2, paidReferralCount: 1, paidRevenueCents: 5000, commissionEarnedCents: 500, pendingCommissionCents: 250 }],
      [
        { affiliateId: "partner-a", referralCount: 3, paidReferralCount: 2, paidRevenueCents: 12000, commissionEarnedCents: 1200, pendingCommissionCents: 400 },
        { affiliateId: "partner-b", referralCount: 1, paidReferralCount: 0, paidRevenueCents: 0, commissionEarnedCents: 0, pendingCommissionCents: 125 },
      ],
    )).toEqual([
      { affiliateId: "partner-a", referralCount: 5, paidReferralCount: 3, paidRevenueCents: 17000, commissionEarnedCents: 1700, pendingCommissionCents: 650 },
      { affiliateId: "partner-b", referralCount: 1, paidReferralCount: 0, paidRevenueCents: 0, commissionEarnedCents: 0, pendingCommissionCents: 125 },
    ]);
  });

  it("returns only the signed-in affiliate's public-safe activity", async () => {
    const date = new Date("2026-10-03T12:00:00.000Z");
    const plans: unknown[][] = [
      [{ id: "affiliate-1", code: "PARTNER", commissionRateBps: 1250, active: true }],
      [{ count: 1, paidCount: 1, revenueCents: 10_000, commissionCents: 1_250, pendingCommissionCents: 0 }],
      [{ count: 1, paidCount: 0, revenueCents: 0, commissionCents: 0, pendingCommissionCents: 1_000 }],
      [{ id: "project-1", label: "creator", status: "paid", createdAt: date, amountCents: 10_000, commissionBps: 1250, currency: "USD" }],
      [{ id: "subscription-1", label: "Growth", status: "unpaid", createdAt: date, amountCents: 8_000, commissionBps: 1250, currency: "USD" }],
    ];
    const query = (rows: unknown[]) => {
      const builder = {
        from: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn(() => builder),
        orderBy: vi.fn(() => builder),
        limit: vi.fn(async () => rows),
        then: (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(rows).then(resolve, reject),
      };
      return builder;
    };
    const db = { select: vi.fn(() => query(plans.shift() ?? [])) } as unknown as DatabaseClient;

    const result = await getAffiliatePortalData(db, "signed-in-user", "https://edicut.com");
    expect(result).toMatchObject({
      code: "PARTNER",
      active: true,
      referralUrl: "https://edicut.com/pricing/creator?ref=PARTNER",
      orderCount: 2,
      paidOrderCount: 1,
      commissionEarnedCents: 1250,
      pendingCommissionCents: 1000,
    });
    expect(result?.orders.map(({ kind, status, commissionCents, pendingCommissionCents }) => ({ kind, status, commissionCents, pendingCommissionCents }))).toEqual([
      { kind: "project", status: "paid", commissionCents: 1250, pendingCommissionCents: 0 },
      { kind: "subscription", status: "unpaid", commissionCents: 0, pendingCommissionCents: 1000 },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/phone|email|ownerId|customer/i);
    expect(plans).toHaveLength(0);
  });

  it("does not load orders if the signed-in account has no affiliate profile", async () => {
    const builder = {
      from: vi.fn(() => builder),
      innerJoin: vi.fn(() => builder),
      where: vi.fn(() => builder),
      limit: vi.fn(async () => []),
    };
    const db = { select: vi.fn(() => builder) } as unknown as DatabaseClient;
    expect(await getAffiliatePortalData(db, "customer-user", "https://edicut.com")).toBeNull();
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});

describe("marketing form parsers", () => {
  it("converts commission percentages to basis points safely", () => {
    expect(parseCommissionRateBps("12.50")).toBe(1_250);
    expect(parseCommissionRateBps("100.01")).toBeNull();
    expect(parseCommissionRateBps("1e2")).toBeNull();
  });

  it("parses real UTC coupon dates and keeps an expiry valid through its day", () => {
    expect(parseCouponDate("2026-02-28")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(parseCouponDate("2026-02-28", true)?.toISOString()).toBe("2026-02-28T23:59:59.999Z");
    expect(parseCouponDate("2026-02-30")).toBeUndefined();
  });
});
