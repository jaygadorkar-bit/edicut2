import { and, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import { customerSubscriptions, marketingAffiliates, marketingCoupons, users, workspaceProjects } from "@edicut/db/schema";

export type MarketingCouponView = {
  id: string;
  code: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minimumSubtotalCents: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: string | null;
  expiresAt: string | null;
  active: boolean;
};

export type MarketingAffiliateView = {
  id: string;
  userId: string;
  name: string;
  email: string;
  code: string;
  commissionRateBps: number;
  active: boolean;
  referralCount: number;
  paidReferralCount: number;
  paidRevenueCents: number;
  commissionEarnedCents: number;
  pendingCommissionCents: number;
  referralUrl: string;
};

export type AffiliatePortalOrderView = {
  id: string;
  kind: "project" | "subscription" | "single";
  label: string;
  status: string;
  createdAt: string;
  amountCents: number | null;
  commissionCents: number;
  pendingCommissionCents: number;
  currency: string;
};

export type AffiliatePortalData = {
  id: string;
  code: string;
  commissionRateBps: number;
  active: boolean;
  referralUrl: string;
  orderCount: number;
  paidOrderCount: number;
  paidRevenueCents: number;
  commissionEarnedCents: number;
  pendingCommissionCents: number;
  orders: AffiliatePortalOrderView[];
};

export type AffiliateCandidateView = {
  id: string;
  name: string;
  email: string;
};

export type AdminMarketingData = {
  schemaReady: boolean;
  coupons: MarketingCouponView[];
  affiliates: MarketingAffiliateView[];
  affiliateCandidates: AffiliateCandidateView[];
};

export type CouponQuote = {
  coupon: MarketingCouponView;
  discountCents: number;
  discountedTotalCents: number;
};

export function normalizeMarketingCode(value: string) {
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code) ? code : null;
}

export function calculateCouponDiscount(
  subtotalCents: number,
  discountType: "percent" | "fixed",
  discountValue: number,
) {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents <= 0) return 0;
  if (!Number.isSafeInteger(discountValue) || discountValue <= 0) return 0;
  const requested = discountType === "percent"
    ? Math.floor(subtotalCents * Math.min(discountValue, 100) / 100)
    : discountValue;
  return Math.min(subtotalCents, requested);
}

export function parseCommissionRateBps(value: string) {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(normalized)) return null;
  const rate = Number(normalized);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;
  return Math.round(rate * 100);
}

export function parseCouponDate(value: string, endOfDay = false) {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
  const date = new Date(`${normalized}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === normalized ? date : undefined;
}

export function isMissingMarketingSchema(error: unknown) {
  // Drizzle wraps the Postgres error in `cause`; inspect each layer without
  // mistaking a failed query's table name for a missing-table error.
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const detail = current as { code?: unknown; message?: unknown; cause?: unknown };
    const message = typeof detail.message === "string" ? detail.message : "";
    if (/(marketing_(coupons|affiliates)|customer_subscriptions)/i.test(message)
      && (detail.code === "42P01" || detail.code === "42703" || /does not exist|undefined table|undefined column/i.test(message))) return true;
    if (detail.code === "42703" && /workspace_projects/i.test(message) && /coupon|affiliate|discount/i.test(message)) return true;
    current = detail.cause;
  }
  return false;
}

export function calculateCommissionCents(amountCents: number | null, rateBps: number) {
  if (amountCents === null || !Number.isSafeInteger(amountCents) || amountCents <= 0) return 0;
  if (!Number.isSafeInteger(rateBps) || rateBps <= 0 || rateBps > 10_000) return 0;
  return Math.round(amountCents * rateBps / 10_000);
}

type AffiliateMetrics = {
  affiliateId: string;
  referralCount: number;
  paidReferralCount: number;
  paidRevenueCents: number;
  commissionEarnedCents: number;
  pendingCommissionCents: number;
};

export function combineAffiliateMetrics(
  affiliateIds: string[],
  ...sources: AffiliateMetrics[][]
) {
  const metricsByAffiliate = new Map<string, AffiliateMetrics>();
  for (const source of sources) {
    for (const item of source) {
      const current = metricsByAffiliate.get(item.affiliateId) ?? {
        affiliateId: item.affiliateId,
        referralCount: 0,
        paidReferralCount: 0,
        paidRevenueCents: 0,
        commissionEarnedCents: 0,
        pendingCommissionCents: 0,
      };
      current.referralCount += item.referralCount;
      current.paidReferralCount += item.paidReferralCount;
      current.paidRevenueCents += item.paidRevenueCents;
      current.commissionEarnedCents += item.commissionEarnedCents;
      current.pendingCommissionCents += item.pendingCommissionCents;
      metricsByAffiliate.set(item.affiliateId, current);
    }
  }
  return affiliateIds.map((affiliateId) => metricsByAffiliate.get(affiliateId) ?? {
    affiliateId,
    referralCount: 0,
    paidReferralCount: 0,
    paidRevenueCents: 0,
    commissionEarnedCents: 0,
    pendingCommissionCents: 0,
  });
}

function couponView(coupon: typeof marketingCoupons.$inferSelect): MarketingCouponView {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType as "percent" | "fixed",
    discountValue: coupon.discountValue,
    minimumSubtotalCents: coupon.minimumSubtotalCents,
    maxRedemptions: coupon.maxRedemptions,
    redemptionCount: coupon.redemptionCount,
    startsAt: coupon.startsAt?.toISOString() ?? null,
    expiresAt: coupon.expiresAt?.toISOString() ?? null,
    active: coupon.active,
  };
}

export async function getAdminMarketingData(db: DatabaseClient, siteOrigin: string): Promise<AdminMarketingData> {
  const [coupons, affiliateProfiles, affiliateCandidates, projectMetrics, subscriptionMetrics] = await Promise.all([
    db.select().from(marketingCoupons).orderBy(desc(marketingCoupons.createdAt)),
    db.select({
      id: marketingAffiliates.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      code: marketingAffiliates.code,
      commissionRateBps: marketingAffiliates.commissionRateBps,
      active: marketingAffiliates.active,
    })
      .from(marketingAffiliates)
      .innerJoin(users, eq(marketingAffiliates.userId, users.id))
      .orderBy(desc(marketingAffiliates.createdAt)),
    db.select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .leftJoin(marketingAffiliates, eq(marketingAffiliates.userId, users.id))
      .where(and(eq(users.role, "affiliate"), eq(users.active, true), isNull(users.deletedAt), isNull(marketingAffiliates.id)))
      .orderBy(users.email)
      .limit(100),
    db.select({
      affiliateId: marketingAffiliates.id,
      referralCount: sql<number>`count(${workspaceProjects.id})`.mapWith(Number),
      paidReferralCount: sql<number>`count(${workspaceProjects.id}) FILTER (WHERE ${workspaceProjects.billingStatus} = 'paid')`.mapWith(Number),
      paidRevenueCents: sql<number>`coalesce(sum(${workspaceProjects.finalAmountCents}) FILTER (WHERE ${workspaceProjects.billingStatus} = 'paid'), 0)`.mapWith(Number),
      commissionEarnedCents: sql<number>`coalesce(sum(round(${workspaceProjects.finalAmountCents} * ${workspaceProjects.affiliateCommissionBps} / 10000.0)) FILTER (WHERE ${workspaceProjects.billingStatus} = 'paid' AND ${workspaceProjects.finalAmountCents} IS NOT NULL), 0)`.mapWith(Number),
      pendingCommissionCents: sql<number>`coalesce(sum(round(${workspaceProjects.finalAmountCents} * ${workspaceProjects.affiliateCommissionBps} / 10000.0)) FILTER (WHERE ${workspaceProjects.billingStatus} <> 'paid' AND ${workspaceProjects.finalAmountCents} IS NOT NULL), 0)`.mapWith(Number),
    }).from(marketingAffiliates)
      .leftJoin(workspaceProjects, or(
        eq(workspaceProjects.affiliateId, marketingAffiliates.id),
        and(isNull(workspaceProjects.affiliateId), eq(workspaceProjects.affiliateCode, marketingAffiliates.code)),
      ))
      .groupBy(marketingAffiliates.id),
    db.select({
      affiliateId: marketingAffiliates.id,
      referralCount: sql<number>`count(${customerSubscriptions.id})`.mapWith(Number),
      paidReferralCount: sql<number>`count(${customerSubscriptions.id}) FILTER (WHERE ${customerSubscriptions.status} = 'paid')`.mapWith(Number),
      paidRevenueCents: sql<number>`coalesce(sum(${customerSubscriptions.amountCents}) FILTER (WHERE ${customerSubscriptions.status} = 'paid'), 0)`.mapWith(Number),
      commissionEarnedCents: sql<number>`coalesce(sum(round(${customerSubscriptions.amountCents} * ${customerSubscriptions.affiliateCommissionBps} / 10000.0)) FILTER (WHERE ${customerSubscriptions.status} = 'paid'), 0)`.mapWith(Number),
      pendingCommissionCents: sql<number>`coalesce(sum(round(${customerSubscriptions.amountCents} * ${customerSubscriptions.affiliateCommissionBps} / 10000.0)) FILTER (WHERE ${customerSubscriptions.status} = 'unpaid'), 0)`.mapWith(Number),
    }).from(marketingAffiliates)
      .leftJoin(customerSubscriptions, and(
        eq(customerSubscriptions.affiliateId, marketingAffiliates.id),
        isNull(customerSubscriptions.deletedAt),
      ))
      .groupBy(marketingAffiliates.id),
  ]);

  const metrics = combineAffiliateMetrics(
    affiliateProfiles.map((affiliate) => affiliate.id),
    projectMetrics,
    subscriptionMetrics,
  );
  const metricsByAffiliate = new Map(metrics.map((item) => [item.affiliateId, item]));

  return {
    schemaReady: true,
    coupons: coupons.map(couponView),
    affiliates: affiliateProfiles.map((affiliate) => ({
      ...affiliate,
      ...(metricsByAffiliate.get(affiliate.id) ?? {
        referralCount: 0,
        paidReferralCount: 0,
        paidRevenueCents: 0,
        commissionEarnedCents: 0,
        pendingCommissionCents: 0,
      }),
      name: affiliate.name || "Affiliate partner",
      referralUrl: new URL(`/pricing/creator?ref=${encodeURIComponent(affiliate.code)}`, siteOrigin).toString(),
    })),
    affiliateCandidates: affiliateCandidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name || "Affiliate partner",
      email: candidate.email,
    })),
  };
}

export async function getAffiliatePortalData(db: DatabaseClient, userId: string, siteOrigin: string): Promise<AffiliatePortalData | null> {
  const [affiliate] = await db.select({
    id: marketingAffiliates.id,
    code: marketingAffiliates.code,
    commissionRateBps: marketingAffiliates.commissionRateBps,
    active: marketingAffiliates.active,
  }).from(marketingAffiliates)
    .innerJoin(users, eq(marketingAffiliates.userId, users.id))
    .where(and(
      eq(marketingAffiliates.userId, userId),
      eq(users.role, "affiliate"),
      eq(users.active, true),
      isNull(users.deletedAt),
    ))
    .limit(1);
  if (!affiliate) return null;

  const projectAttribution = or(
    eq(workspaceProjects.affiliateId, affiliate.id),
    and(isNull(workspaceProjects.affiliateId), eq(workspaceProjects.affiliateCode, affiliate.code)),
  );
  const [projectSummary, subscriptionSummary, projectRows, subscriptionRows] = await Promise.all([
    db.select({
      count: sql<number>`count(*)`.mapWith(Number),
      paidCount: sql<number>`count(*) FILTER (WHERE ${workspaceProjects.billingStatus} = 'paid')`.mapWith(Number),
      revenueCents: sql<number>`coalesce(sum(${workspaceProjects.finalAmountCents}) FILTER (WHERE ${workspaceProjects.billingStatus} = 'paid'), 0)`.mapWith(Number),
      commissionCents: sql<number>`coalesce(sum(round(${workspaceProjects.finalAmountCents} * ${workspaceProjects.affiliateCommissionBps} / 10000.0)) FILTER (WHERE ${workspaceProjects.billingStatus} = 'paid' AND ${workspaceProjects.finalAmountCents} IS NOT NULL), 0)`.mapWith(Number),
      pendingCommissionCents: sql<number>`coalesce(sum(round(${workspaceProjects.finalAmountCents} * ${workspaceProjects.affiliateCommissionBps} / 10000.0)) FILTER (WHERE ${workspaceProjects.billingStatus} <> 'paid' AND ${workspaceProjects.finalAmountCents} IS NOT NULL), 0)`.mapWith(Number),
    }).from(workspaceProjects).where(projectAttribution),
    db.select({
      count: sql<number>`count(*)`.mapWith(Number),
      paidCount: sql<number>`count(*) FILTER (WHERE ${customerSubscriptions.status} = 'paid')`.mapWith(Number),
      revenueCents: sql<number>`coalesce(sum(${customerSubscriptions.amountCents}) FILTER (WHERE ${customerSubscriptions.status} = 'paid'), 0)`.mapWith(Number),
      commissionCents: sql<number>`coalesce(sum(round(${customerSubscriptions.amountCents} * ${customerSubscriptions.affiliateCommissionBps} / 10000.0)) FILTER (WHERE ${customerSubscriptions.status} = 'paid'), 0)`.mapWith(Number),
      pendingCommissionCents: sql<number>`coalesce(sum(round(${customerSubscriptions.amountCents} * ${customerSubscriptions.affiliateCommissionBps} / 10000.0)) FILTER (WHERE ${customerSubscriptions.status} = 'unpaid'), 0)`.mapWith(Number),
    }).from(customerSubscriptions).where(and(
      eq(customerSubscriptions.affiliateId, affiliate.id),
      isNull(customerSubscriptions.deletedAt),
    )),
    db.select({
      id: workspaceProjects.id,
      label: workspaceProjects.packageSlug,
      status: workspaceProjects.billingStatus,
      createdAt: workspaceProjects.createdAt,
      amountCents: workspaceProjects.finalAmountCents,
      commissionBps: workspaceProjects.affiliateCommissionBps,
      currency: workspaceProjects.currency,
    }).from(workspaceProjects).where(projectAttribution).orderBy(desc(workspaceProjects.createdAt)).limit(50),
    db.select({
      id: customerSubscriptions.id,
      label: customerSubscriptions.planName,
      purchaseType: customerSubscriptions.purchaseType,
      status: customerSubscriptions.status,
      createdAt: customerSubscriptions.createdAt,
      amountCents: customerSubscriptions.amountCents,
      commissionBps: customerSubscriptions.affiliateCommissionBps,
      currency: customerSubscriptions.currency,
    }).from(customerSubscriptions).where(and(
      eq(customerSubscriptions.affiliateId, affiliate.id),
      isNull(customerSubscriptions.deletedAt),
    )).orderBy(desc(customerSubscriptions.createdAt)).limit(50),
  ]);

  const orders: AffiliatePortalOrderView[] = [
    ...projectRows.map((row) => ({
      id: row.id,
      kind: "project" as const,
      label: row.label,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      amountCents: row.amountCents,
      commissionCents: row.status === "paid" ? calculateCommissionCents(row.amountCents, row.commissionBps) : 0,
      pendingCommissionCents: row.status !== "paid" ? calculateCommissionCents(row.amountCents, row.commissionBps) : 0,
      currency: row.currency,
    })),
    ...subscriptionRows.map((row) => ({
      id: row.id,
      kind: row.purchaseType === "single" ? "single" as const : "subscription" as const,
      label: row.label,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      amountCents: row.amountCents,
      commissionCents: row.status === "paid" ? calculateCommissionCents(row.amountCents, row.commissionBps) : 0,
      pendingCommissionCents: row.status === "unpaid" ? calculateCommissionCents(row.amountCents, row.commissionBps) : 0,
      currency: row.currency,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);

  const projectTotals = projectSummary[0] ?? { count: 0, paidCount: 0, revenueCents: 0, commissionCents: 0, pendingCommissionCents: 0 };
  const subscriptionTotals = subscriptionSummary[0] ?? { count: 0, paidCount: 0, revenueCents: 0, commissionCents: 0, pendingCommissionCents: 0 };
  return {
    ...affiliate,
    referralUrl: new URL(`/pricing/creator?ref=${encodeURIComponent(affiliate.code)}`, siteOrigin).toString(),
    orderCount: projectTotals.count + subscriptionTotals.count,
    paidOrderCount: projectTotals.paidCount + subscriptionTotals.paidCount,
    paidRevenueCents: projectTotals.revenueCents + subscriptionTotals.revenueCents,
    commissionEarnedCents: projectTotals.commissionCents + subscriptionTotals.commissionCents,
    pendingCommissionCents: projectTotals.pendingCommissionCents + subscriptionTotals.pendingCommissionCents,
    orders,
  };
}

export async function findCouponForQuote(db: DatabaseClient, rawCode: string, subtotalCents: number, userId: string) {
  const code = normalizeMarketingCode(rawCode);
  if (!code) return { error: "Enter a valid coupon code." } as const;

  const now = new Date();
  const [coupon] = await db.select().from(marketingCoupons).where(and(
    eq(marketingCoupons.code, code),
    eq(marketingCoupons.active, true),
    or(isNull(marketingCoupons.startsAt), lte(marketingCoupons.startsAt, now)),
    or(isNull(marketingCoupons.expiresAt), gt(marketingCoupons.expiresAt, now)),
    or(isNull(marketingCoupons.maxRedemptions), lt(marketingCoupons.redemptionCount, marketingCoupons.maxRedemptions)),
  )).limit(1);

  if (!coupon) return { error: "That coupon is not active or has reached its usage limit." } as const;
  if (coupon.minimumSubtotalCents != null && subtotalCents < coupon.minimumSubtotalCents) {
    return { error: `This code requires a minimum package price of $${(coupon.minimumSubtotalCents / 100).toFixed(2)}.` } as const;
  }

  const [priorUse] = await db.select({ id: workspaceProjects.id }).from(workspaceProjects).where(and(
    eq(workspaceProjects.ownerId, userId),
    eq(workspaceProjects.couponId, coupon.id),
  )).limit(1);
  if (priorUse) return { error: "This coupon has already been used on your account." } as const;

  const [paidSubscription] = await db.select({ id: customerSubscriptions.id }).from(customerSubscriptions).where(and(
    eq(customerSubscriptions.ownerId, userId),
    eq(customerSubscriptions.couponCode, code),
    eq(customerSubscriptions.status, "paid"),
  )).limit(1);
  if (paidSubscription) return { error: "This coupon has already been used on your account." } as const;

  const discountCents = calculateCouponDiscount(subtotalCents, coupon.discountType as "percent" | "fixed", coupon.discountValue);
  if (discountCents <= 0) return { error: "This coupon does not apply to the current package." } as const;

  return {
    coupon: couponView(coupon),
    discountCents,
    discountedTotalCents: subtotalCents - discountCents,
  } satisfies CouponQuote;
}

export async function findAffiliateByCode(db: DatabaseClient, rawCode: string) {
  const code = normalizeMarketingCode(rawCode);
  if (!code) return null;

  const [affiliate] = await db.select({
    id: marketingAffiliates.id,
    userId: marketingAffiliates.userId,
    code: marketingAffiliates.code,
    commissionRateBps: marketingAffiliates.commissionRateBps,
  })
    .from(marketingAffiliates)
    .innerJoin(users, eq(marketingAffiliates.userId, users.id))
    .where(and(
      eq(marketingAffiliates.code, code),
      eq(marketingAffiliates.active, true),
      eq(users.active, true),
      eq(users.role, "affiliate"),
      isNull(users.deletedAt),
    ))
    .limit(1);

  return affiliate ?? null;
}

export const MARKETING_MIGRATION_NOTICE = "Marketing and affiliate tools are temporarily unavailable until the required database migrations are applied.";
