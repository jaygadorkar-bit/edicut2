import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import {
  adminUsers, affiliateApplications, affiliateOrderAttributions, affiliatePayoutItems,
  affiliatePayouts, affiliateVisits, customerSubscriptions, marketingAffiliates,
  marketingCoupons, siteSettings, users, workspaceProjects,
} from "@edicut/db/schema";
import {
  calculateAffiliateCommissionCents, DEFAULT_AFFILIATE_PROGRAM_SETTINGS,
  normalizeAffiliateCampaign, normalizeAffiliateSocialMedia, normalizeWhatsAppPhone, parseAffiliateSettings,
  type AffiliateApplicationInput, type AffiliatePayoutInput,
  type AffiliateProgramResult, type AffiliateProgramSettings,
} from "./affiliate-program";

const SETTINGS_KEY = "affiliate_program_v1";
const emptyBalance = () => ({ earnedCents: 0, pendingCents: 0, estimatedCents: 0, availableCents: 0, reservedCents: 0, paidCents: 0, clawbackCents: 0 });
const safe = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export async function loadAffiliateProgram(db: DatabaseClient) {
  try {
    const [[row]] = await Promise.all([
      db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, SETTINGS_KEY)).limit(1),
      db.select({ id: affiliateApplications.id }).from(affiliateApplications).limit(1),
    ]);
    return { schemaReady: true, settings: parseAffiliateSettings(row?.value) };
  } catch (error) {
    if (isMissingAffiliateSchema(error)) return { schemaReady: false, settings: { ...DEFAULT_AFFILIATE_PROGRAM_SETTINGS } };
    throw error;
  }
}

export async function saveProgramSettings(db: DatabaseClient, form: FormData | AffiliateProgramSettings): Promise<AffiliateProgramResult> {
  const source = (form instanceof FormData ? Object.fromEntries(form.entries()) : form) as Record<string, unknown>;
  const attributionDays = Number(source.attributionDays);
  const holdDays = Number(source.holdDays);
  const minimumPayoutCents = source.minimumPayoutCents !== undefined
    ? Number(source.minimumPayoutCents)
    : Number.isFinite(Number(source.minimumPayout)) ? Math.round(Number(source.minimumPayout) * 100) : NaN;
  if (!Number.isSafeInteger(attributionDays) || attributionDays < 1 || attributionDays > 90 || !Number.isSafeInteger(holdDays) || holdDays < 0 || holdDays > 180 || !Number.isSafeInteger(minimumPayoutCents) || minimumPayoutCents < 500 || minimumPayoutCents > 10000000) return { error: "Enter valid affiliate program settings." };
  const settings = parseAffiliateSettings(JSON.stringify({
    attributionDays, holdDays, minimumPayoutCents,
    payoutsEnabled: source.payoutsEnabled === true || source.payoutsEnabled === "on" || source.payoutsEnabled === "true",
    applicationsOpen: form instanceof FormData
      ? form.get("applicationsOpen") === "true" || form.get("applicationsOpen") === "on"
      : source.applicationsOpen === true,
  }));
  await db.insert(siteSettings).values({ key: SETTINGS_KEY, value: JSON.stringify(settings) })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value: JSON.stringify(settings), updatedAt: new Date() } });
  return { success: "Affiliate program settings saved." };
}

export async function saveApplication(db: DatabaseClient, userId: string, input: AffiliateApplicationInput): Promise<AffiliateProgramResult> {
  if (!isUuid(userId)) return { error: "Sign in to submit an application." };
  const whatsappPhone = normalizeWhatsAppPhone(safe(input.whatsappPhone, 64));
  if (!whatsappPhone) return { error: "Enter a valid WhatsApp number with its country code." };
  const socialMedia = normalizeAffiliateSocialMedia(safe(input.socialMedia, 2000));
  if (socialMedia === undefined) return { error: "Enter up to five valid HTTPS social profile links, one per line." };
  const promotionPlan = safe(input.promotionPlan, 4000);
  if (promotionPlan.length < 2) return { error: "Tell us how you would promote EdiCut." };
  const { settings } = await loadAffiliateProgram(db);
  if (!settings.applicationsOpen) return { error: "Affiliate applications are currently closed." };
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-applicant:${userId}`}))`);
    const [existing] = await tx.select({ id: affiliateApplications.id, status: affiliateApplications.status }).from(affiliateApplications).where(eq(affiliateApplications.userId, userId)).limit(1);
    if (existing?.status === "approved") return { error: "Your affiliate application is already approved." };
    if (existing?.status === "pending") return { error: "Your application is already awaiting review." };
    if (existing) await tx.update(affiliateApplications).set({ whatsappPhone, socialMedia, promotionPlan, status: "pending", reviewNote: null, reviewedBy: null, reviewedAt: null, updatedAt: new Date() }).where(eq(affiliateApplications.id, existing.id));
    else await tx.insert(affiliateApplications).values({ userId, whatsappPhone, socialMedia, promotionPlan });
    return { success: "Your application has been submitted for review." };
  });
}

export async function recordAffiliateVisit(
  db: DatabaseClient,
  input: { code: string; campaign?: string | null; landingPath: string; userId?: string | null },
): Promise<string | null> {
  const [profile] = await db.select({ id: marketingAffiliates.id, userId: marketingAffiliates.userId })
    .from(marketingAffiliates).innerJoin(users, eq(users.id, marketingAffiliates.userId))
    .where(and(eq(marketingAffiliates.code, input.code.toUpperCase()), eq(marketingAffiliates.active, true), eq(users.active, true), isNull(users.deletedAt))).limit(1);
  if (!profile || (input.userId && input.userId === profile.userId)) return null;
  const landingPath = safe(input.landingPath, 512);
  if (!landingPath.startsWith("/") || landingPath.startsWith("//")) return null;
  const [visit] = await db.insert(affiliateVisits).values({ affiliateId: profile.id, campaign: normalizeAffiliateCampaign(input.campaign), landingPath }).returning({ id: affiliateVisits.id });
  return visit?.id ?? null;
}

export async function attributeAffiliateSubscription(
  db: DatabaseClient,
  input: { subscriptionId: string; affiliateCode: string; visitId?: string | null; campaign?: string | null; userId: string },
) {
  if (!isUuid(input.subscriptionId) || !isUuid(input.userId)) return false;
  const [profile] = await db.select({ id: marketingAffiliates.id, userId: marketingAffiliates.userId }).from(marketingAffiliates)
    .innerJoin(users, eq(users.id, marketingAffiliates.userId))
    .where(and(eq(marketingAffiliates.code, input.affiliateCode.toUpperCase()), eq(marketingAffiliates.active, true), eq(users.active, true), isNull(users.deletedAt))).limit(1);
  if (!profile || profile.userId === input.userId) return false;
  const settings = (await loadAffiliateProgram(db)).settings;
  let visitId: string | null = input.visitId ?? null;
  if (visitId) {
    const [visit] = await db.select({ id: affiliateVisits.id }).from(affiliateVisits).where(and(
      eq(affiliateVisits.id, visitId), eq(affiliateVisits.affiliateId, profile.id),
      gt(affiliateVisits.createdAt, new Date(Date.now() - settings.attributionDays * 86400000)),
    )).limit(1);
    if (!visit) visitId = null;
  }
  const [subscription] = await db.select({ id: customerSubscriptions.id, ownerId: customerSubscriptions.ownerId, affiliateId: customerSubscriptions.affiliateId })
    .from(customerSubscriptions).where(eq(customerSubscriptions.id, input.subscriptionId)).limit(1);
  if (!subscription || subscription.ownerId !== input.userId || subscription.affiliateId !== profile.id) return false;
  await db.insert(affiliateOrderAttributions).values({ subscriptionId: subscription.id, affiliateId: profile.id, visitId, campaign: normalizeAffiliateCampaign(input.campaign) }).onConflictDoNothing();
  return true;
}

export async function loadPartnerProgram(db: DatabaseClient, userId: string, origin: string) {
  const base = await loadAffiliateProgram(db);
  const blank = { ...base, application: null, code: null, commissionRateBps: null, couponCode: null, discountRateBps: null, active: false, referralUrl: null, campaigns: [], visits: [], payouts: [], balance: emptyBalance(), orders: [] };
  if (!base.schemaReady) return blank;
  try {
    const [application] = await db.select().from(affiliateApplications).where(eq(affiliateApplications.userId, userId)).limit(1);
    const [profile] = await db.select({ id: marketingAffiliates.id, code: marketingAffiliates.code, commissionRateBps: marketingAffiliates.commissionRateBps, couponCode: marketingCoupons.code, discountValue: marketingCoupons.discountValue, active: marketingAffiliates.active })
      .from(marketingAffiliates).leftJoin(marketingCoupons, eq(marketingCoupons.affiliateId, marketingAffiliates.id)).innerJoin(users, eq(users.id, marketingAffiliates.userId))
      .where(and(eq(marketingAffiliates.userId, userId), eq(users.active, true), isNull(users.deletedAt))).limit(1);
    const applicationView = application ? { id: application.id, channelUrl: application.channelUrl, audience: application.audience, whatsappPhone: application.whatsappPhone, socialMedia: application.socialMedia, promotionPlan: application.promotionPlan, status: application.status as "pending" | "approved" | "rejected", reviewNote: application.reviewNote, createdAt: application.createdAt.toISOString(), reviewedAt: application.reviewedAt?.toISOString() ?? null } : null;
    if (!profile) return { ...blank, application: applicationView };
    const [visits, payouts, rawSources, [payoutTotals], campaignTotals] = await Promise.all([
      db.select({ id: affiliateVisits.id, campaign: affiliateVisits.campaign, landingPath: affiliateVisits.landingPath, createdAt: affiliateVisits.createdAt }).from(affiliateVisits).where(eq(affiliateVisits.affiliateId, profile.id)).orderBy(desc(affiliateVisits.createdAt)).limit(100),
      db.select().from(affiliatePayouts).where(eq(affiliatePayouts.affiliateId, profile.id)).orderBy(desc(affiliatePayouts.createdAt)).limit(50),
      getAffiliateSources(db, profile.id, base.settings.holdDays),
      db.select({ paidCents: sql<number>`coalesce(sum(${affiliatePayouts.amountCents}) FILTER (WHERE ${affiliatePayouts.status} = 'paid'), 0)`.mapWith(Number), reservedCents: sql<number>`coalesce(sum(${affiliatePayouts.amountCents}) FILTER (WHERE ${affiliatePayouts.status} IN ('requested','approved')), 0)`.mapWith(Number) }).from(affiliatePayouts).where(eq(affiliatePayouts.affiliateId, profile.id)),
      db.select({ campaign: affiliateVisits.campaign, visits: sql<number>`count(*)`.mapWith(Number) }).from(affiliateVisits).where(eq(affiliateVisits.affiliateId, profile.id)).groupBy(affiliateVisits.campaign),
    ]);
    const orders = rawSources.sources;
    const balance = emptyBalance();
    for (const order of orders) {
      balance.earnedCents += order.paidAt ? order.commissionCents : 0;
      balance.pendingCents += order.paidAt && order.payoutStatus === "pending" ? order.commissionCents : 0;
      balance.estimatedCents += order.paidAt ? 0 : order.commissionCents;
      if (order.payoutStatus === "available") balance.availableCents += order.commissionCents;
      if (order.payoutStatus === "reserved") balance.reservedCents += order.commissionCents;
      if (order.payoutStatus === "paid") balance.paidCents += order.commissionCents;
    }
    balance.availableCents = Math.max(0, balance.availableCents - rawSources.clawbackCents);
    balance.clawbackCents = rawSources.clawbackCents;
    balance.reservedCents = payoutTotals?.reservedCents ?? 0;
    balance.paidCents = payoutTotals?.paidCents ?? 0;
    const referralUrl = new URL(`/pricing/creator?ref=${encodeURIComponent(profile.code)}`, origin).toString();
    return { ...blank, application: applicationView, code: profile.code, commissionRateBps: profile.commissionRateBps, couponCode: profile.couponCode ?? null, discountRateBps: profile.discountValue == null ? null : profile.discountValue * 100, active: profile.active, referralUrl,
      visits: visits.map(v => ({ ...v, createdAt: v.createdAt.toISOString() })), campaigns: campaignTotals.map(({ campaign, visits }) => ({ campaign, visits, referralUrl: campaign ? `${referralUrl}&campaign=${encodeURIComponent(campaign)}` : referralUrl })),
      payouts: payouts.map(p => ({ id: p.id, amountCents: p.amountCents, method: p.method as "paypal" | "manual", destination: p.destination, status: p.status as "requested" | "approved" | "paid" | "rejected" | "cancelled", reference: p.reference, note: p.note, createdAt: p.createdAt.toISOString(), reviewedAt: p.reviewedAt?.toISOString() ?? null, paidAt: p.paidAt?.toISOString() ?? null })), balance, orders };
  } catch (error) {
    if (isMissingAffiliateSchema(error)) return { ...blank, schemaReady: false };
    throw error;
  }
}

async function getAffiliateSources(db: DatabaseClient, affiliateId: string, holdDays: number) {
  const [projects, subscriptions] = await Promise.all([
    db.select({ id: workspaceProjects.id, label: workspaceProjects.packageSlug, status: workspaceProjects.billingStatus, createdAt: workspaceProjects.createdAt, updatedAt: workspaceProjects.updatedAt, amountCents: workspaceProjects.finalAmountCents, currency: workspaceProjects.currency, rate: workspaceProjects.affiliateCommissionBps })
      .from(workspaceProjects).where(and(sql`(${workspaceProjects.affiliateId} = ${affiliateId} OR (${workspaceProjects.affiliateId} IS NULL AND ${workspaceProjects.affiliateCode} = (SELECT code FROM marketing_affiliates WHERE id = ${affiliateId})))`, eq(workspaceProjects.billingStatus, "paid"), eq(workspaceProjects.currency, "USD"), sql`${workspaceProjects.finalAmountCents} IS NOT NULL`, sql`${workspaceProjects.ownerId} <> (SELECT user_id FROM marketing_affiliates WHERE id = ${affiliateId})`, sql`NOT EXISTS (SELECT 1 FROM project_intakes pi WHERE pi.project_id = ${workspaceProjects.id})`)).orderBy(workspaceProjects.createdAt, workspaceProjects.id),
    db.select({ id: customerSubscriptions.id, label: customerSubscriptions.planName, status: customerSubscriptions.status, createdAt: customerSubscriptions.createdAt, paidAt: customerSubscriptions.paidAt, amountCents: customerSubscriptions.amountCents, currency: customerSubscriptions.currency, rate: customerSubscriptions.affiliateCommissionBps, deletedAt: customerSubscriptions.deletedAt })
      .from(customerSubscriptions).where(and(eq(customerSubscriptions.affiliateId, affiliateId), eq(customerSubscriptions.currency, "USD"), isNull(customerSubscriptions.deletedAt), sql`${customerSubscriptions.ownerId} <> (SELECT user_id FROM marketing_affiliates WHERE id = ${affiliateId})`)).orderBy(customerSubscriptions.createdAt, customerSubscriptions.id),
  ]);
  const now = Date.now();
  const out = [
    ...projects.map(p => {
      const eligibleAt = new Date(p.updatedAt.getTime() + holdDays * 86400000);
      return { id: p.id, kind: "project" as const, label: p.label, status: p.status, createdAt: p.createdAt.toISOString(), paidAt: p.updatedAt.toISOString(), currency: p.currency, amountCents: p.amountCents ?? 0, commissionCents: calculateAffiliateCommissionCents(p.amountCents ?? 0, p.rate), eligibleAt: eligibleAt.toISOString(), _eligible: eligibleAt.getTime() <= now };
    }),
    ...subscriptions.map(s => {
      const paid = s.status === "paid" && !!s.paidAt;
      const eligibleAt = paid ? new Date(s.paidAt!.getTime() + holdDays * 86400000) : null;
      return { id: s.id, kind: "subscription" as const, label: s.label, status: s.status, createdAt: s.createdAt.toISOString(), paidAt: s.paidAt?.toISOString() ?? null, currency: s.currency, amountCents: s.amountCents, commissionCents: calculateAffiliateCommissionCents(s.amountCents, s.rate), eligibleAt: eligibleAt?.toISOString() ?? null, _eligible: !!eligibleAt && eligibleAt.getTime() <= now };
    }),
  ];
  const priorItems = await db.select({ sourceType: affiliatePayoutItems.sourceType, sourceId: affiliatePayoutItems.sourceId, amountCents: affiliatePayoutItems.amountCents, reserved: affiliatePayoutItems.reserved, status: affiliatePayouts.status })
    .from(affiliatePayoutItems).innerJoin(affiliatePayouts, eq(affiliatePayouts.id, affiliatePayoutItems.payoutId))
    .where(eq(affiliatePayouts.affiliateId, affiliateId));
  const previous = new Map(priorItems.filter(item => item.reserved).map(item => [`${item.sourceType}:${item.sourceId}`, item.status === "paid" ? "paid" as const : "reserved" as const]));
  const clawbackCents = priorItems.filter(item => item.status === "paid").reduce((total, item) => {
    const source = out.find(candidate => `${candidate.kind}:${candidate.id}` === `${item.sourceType}:${item.sourceId}`);
    // A paid commission is reversed in full if its source order is no longer paid.
    // If only the eligible amount changed, reconcile the difference instead.
    return total + (!source || source.status !== "paid" ? item.amountCents : Math.max(0, item.amountCents - source.commissionCents));
  }, 0);
  const sources = out.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(({ _eligible, ...item }) => {
    const prior = previous.get(`${item.kind}:${item.id}`);
    return { ...item, eligibleAt: item.eligibleAt, payoutStatus: prior ?? (item.status === "paid" ? (_eligible ? "available" as const : "pending" as const) : "pending" as const) };
  });
  return { sources, clawbackCents };
}

export async function loadAdminAffiliateProgram(db: DatabaseClient) {
  const base = await loadAffiliateProgram(db);
  if (!base.schemaReady) return { ...base, applications: [], payouts: [], visitCount: 0 };
  try {
    const [applications, payouts, [visitCount]] = await Promise.all([
      db.select({ id: affiliateApplications.id, userId: affiliateApplications.userId, channelUrl: affiliateApplications.channelUrl, audience: affiliateApplications.audience, whatsappPhone: affiliateApplications.whatsappPhone, socialMedia: affiliateApplications.socialMedia, promotionPlan: affiliateApplications.promotionPlan, status: affiliateApplications.status, reviewNote: affiliateApplications.reviewNote, createdAt: affiliateApplications.createdAt, reviewedAt: affiliateApplications.reviewedAt, name: users.name, email: users.email }).from(affiliateApplications).innerJoin(users, eq(users.id, affiliateApplications.userId)).orderBy(desc(affiliateApplications.createdAt)).limit(100),
      db.select({ id: affiliatePayouts.id, affiliateId: affiliatePayouts.affiliateId, amountCents: affiliatePayouts.amountCents, method: affiliatePayouts.method, destination: affiliatePayouts.destination, status: affiliatePayouts.status, reference: affiliatePayouts.reference, note: affiliatePayouts.note, createdAt: affiliatePayouts.createdAt, reviewedAt: affiliatePayouts.reviewedAt, paidAt: affiliatePayouts.paidAt, userId: marketingAffiliates.userId, name: users.name, email: users.email }).from(affiliatePayouts).innerJoin(marketingAffiliates, eq(marketingAffiliates.id, affiliatePayouts.affiliateId)).innerJoin(users, eq(users.id, marketingAffiliates.userId)).orderBy(desc(affiliatePayouts.createdAt)).limit(100),
      db.select({ value: sql<number>`count(*)::int` }).from(affiliateVisits),
    ]);
    return { ...base, applications: applications.map(a => ({ ...a, name: a.name ?? "Affiliate applicant", status: a.status as "pending" | "approved" | "rejected", createdAt: a.createdAt.toISOString(), reviewedAt: a.reviewedAt?.toISOString() ?? null })), payouts: payouts.map(p => ({ ...p, name: p.name ?? "Affiliate partner", method: p.method as "paypal" | "manual", status: p.status as "requested" | "approved" | "paid" | "rejected" | "cancelled", createdAt: p.createdAt.toISOString(), reviewedAt: p.reviewedAt?.toISOString() ?? null, paidAt: p.paidAt?.toISOString() ?? null })), visitCount: visitCount?.value ?? 0 };
  } catch (error) { if (isMissingAffiliateSchema(error)) return { ...base, schemaReady: false, applications: [], payouts: [], visitCount: 0 }; throw error; }
}

export async function reviewApplication(db: DatabaseClient, adminId: string, form: FormData): Promise<AffiliateProgramResult> {
  const id = safe(form.get("applicationId") ?? form.get("id"), 36);
  const status = safe(form.get("decision") ?? form.get("status"), 16);
  const note = safe(form.get("reviewNote") ?? form.get("note"), 2000) || null;
  if (!isUuid(id) || !isUuid(adminId)) return { error: "Invalid application or administrator." };
  if (!["approved", "rejected"].includes(status)) return { error: "Choose approve or reject." };
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-app:${id}`}))`);
    const [application] = await tx.select().from(affiliateApplications).where(eq(affiliateApplications.id, id)).for("update").limit(1);
    if (!application || application.status !== "pending") return { error: "This application is no longer pending." };
    const [user] = await tx.select({ active: users.active, deletedAt: users.deletedAt }).from(users).where(eq(users.id, application.userId)).limit(1);
    if (status === "approved") {
      if (!user?.active || user.deletedAt) return { error: "Only active accounts can be approved." };
      const [existing] = await tx.select({ id: marketingAffiliates.id }).from(marketingAffiliates).where(eq(marketingAffiliates.userId, application.userId)).limit(1);
      if (existing) return { error: "This applicant already has an affiliate profile." };
      const code = safe(form.get("code"), 32).toUpperCase();
      const couponCode = safe(form.get("couponCode"), 32).toUpperCase() || code;
      const bpsRaw = form.get("commissionRateBps");
      const commissionRaw = bpsRaw ?? form.get("commissionRate");
      const commissionText = typeof commissionRaw === "string" ? commissionRaw.trim() : "";
      const commissionRateBps = !commissionText ? 1000 : bpsRaw !== null
        ? Number(commissionText) : /^(?:0|[1-9]\d{0,2})(?:\.\d{1,2})?$/.test(commissionText) ? Math.round(Number(commissionText) * 100) : NaN;
      const discountText = safe(form.get("discountRate"), 8) || "10";
      const discountRate = /^(?:[1-9]|[1-9]\d|100)$/.test(discountText) ? Number(discountText) : NaN;
      if (!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code) || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(couponCode) || !Number.isSafeInteger(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 10000 || !Number.isSafeInteger(discountRate) || discountRate < 1 || discountRate > 100) return { error: "Enter valid referral and coupon codes, a 0–100% commission, and a 1–100% coupon discount." };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-code:${code}`}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-coupon:${couponCode}`}))`);
      const [collision] = await tx.select({ id: marketingAffiliates.id }).from(marketingAffiliates).where(eq(marketingAffiliates.code, code)).limit(1);
      if (collision) return { error: "That referral code is already in use." };
      const [couponCollision] = await tx.select({ id: marketingCoupons.id }).from(marketingCoupons).where(eq(marketingCoupons.code, couponCode)).limit(1);
      if (couponCollision) return { error: "That coupon code is already in use. Choose a different code." };
      const [couponReferralCollision] = await tx.select({ id: marketingAffiliates.id }).from(marketingAffiliates).where(eq(marketingAffiliates.code, couponCode)).limit(1);
      if (couponReferralCollision) return { error: "That coupon code is already being used as another partner’s referral code." };
      const [referralCouponCollision] = await tx.select({ id: marketingCoupons.id }).from(marketingCoupons).where(eq(marketingCoupons.code, code)).limit(1);
      if (referralCouponCollision) return { error: "That referral code is already being used as a coupon. Choose a different code." };
      const [affiliate] = await tx.insert(marketingAffiliates).values({ userId: application.userId, code, commissionRateBps, active: true }).returning({ id: marketingAffiliates.id });
      if (!affiliate) return { error: "The affiliate profile could not be created." };
      await tx.insert(marketingCoupons).values({ affiliateId: affiliate.id, code: couponCode, discountType: "percent", discountValue: discountRate, active: true });
    }
    await tx.update(affiliateApplications).set({ status, reviewNote: note, reviewedBy: adminId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(affiliateApplications.id, id));
    return { success: `Application ${status}.` };
  });
}

export async function requestPayout(db: DatabaseClient, userId: string, input: AffiliatePayoutInput): Promise<AffiliateProgramResult> {
  if (!isUuid(userId)) return { error: "Sign in to request a payout." };
  const destination = safe(input.destination, 254);
  if (!["paypal", "manual"].includes(input.method) || destination.length < 3) return { error: "Enter a valid payout method and destination." };
  const settings = (await loadAffiliateProgram(db)).settings;
  if (!settings.payoutsEnabled) return { error: "Payout requests are currently disabled." };
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-payout:${userId}`}))`);
    const [profile] = await tx.select({ id: marketingAffiliates.id, active: marketingAffiliates.active }).from(marketingAffiliates).innerJoin(users, eq(users.id, marketingAffiliates.userId))
      .where(and(eq(marketingAffiliates.userId, userId), eq(marketingAffiliates.active, true), eq(users.active, true), isNull(users.deletedAt))).limit(1);
    if (!profile?.active) return { error: "An active affiliate profile is required." };
    const sourceData = await getAffiliateSources(tx as unknown as DatabaseClient, profile.id, settings.holdDays);
    const eligible = sourceData.sources.filter(s => s.payoutStatus === "available" && s.commissionCents > 0);
    const amount = eligible.reduce((sum, source) => sum + source.commissionCents, 0);
    if (sourceData.clawbackCents > 0) return { error: "Your balance has an unresolved reversal; contact support before requesting another payout." };
    if (!Number.isSafeInteger(amount) || amount > 2147483647) return { error: "Your eligible balance is outside the supported payout range; contact support." };
    if (amount < settings.minimumPayoutCents) return { error: "Your eligible balance has not reached the payout minimum." };
    const [payout] = await tx.insert(affiliatePayouts).values({ affiliateId: profile.id, amountCents: amount, method: input.method, destination }).returning({ id: affiliatePayouts.id });
    if (!payout) return { error: "Unable to create payout request." };
    await tx.insert(affiliatePayoutItems).values(eligible.map(source => ({ payoutId: payout.id, sourceType: source.kind, sourceId: source.id, amountCents: source.commissionCents, reserved: true })));
    return { success: "Payout request submitted." };
  });
}

export async function cancelPayout(db: DatabaseClient, userId: string, payoutId: string): Promise<AffiliateProgramResult> {
  if (!isUuid(userId) || !isUuid(payoutId)) return { error: "Invalid payout request." };
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-payout:${userId}`}))`);
    const [profile] = await tx.select({ id: marketingAffiliates.id }).from(marketingAffiliates).where(eq(marketingAffiliates.userId, userId)).limit(1);
    if (!profile) return { error: "Affiliate profile not found." };
    const [payout] = await tx.select({ id: affiliatePayouts.id, status: affiliatePayouts.status }).from(affiliatePayouts).where(and(eq(affiliatePayouts.id, payoutId), eq(affiliatePayouts.affiliateId, profile.id))).for("update").limit(1);
    if (!payout || payout.status !== "requested") return { error: "Only a pending payout request can be cancelled." };
    await tx.update(affiliatePayouts).set({ status: "cancelled", updatedAt: new Date() }).where(eq(affiliatePayouts.id, payout.id));
    await tx.update(affiliatePayoutItems).set({ reserved: false }).where(eq(affiliatePayoutItems.payoutId, payout.id));
    return { success: "Payout request cancelled." };
  });
}

export async function reviewPayout(db: DatabaseClient, adminId: string, form: FormData): Promise<AffiliateProgramResult> {
  const id = safe(form.get("payoutId") ?? form.get("id"), 36);
  const status = safe(form.get("decision") ?? form.get("status"), 16);
  const note = safe(form.get("note"), 2000) || null;
  const reference = safe(form.get("reference"), 254) || null;
  if (!isUuid(id) || !isUuid(adminId)) return { error: "Invalid payout or administrator." };
  if (!["approved", "paid", "rejected"].includes(status)) return { error: "Choose approve, pay, or reject." };
  if (status === "paid" && form.get("confirmExternalPayment") !== "true" && form.get("confirmExternalPayment") !== "on") return { error: "Confirm that the external payment has already been sent." };
  if (status === "paid" && !reference) return { error: "A payment reference is required to record an external payment." };
  return db.transaction(async tx => {
    const [beforeLock] = await tx.select({ affiliateId: affiliatePayouts.affiliateId }).from(affiliatePayouts).where(eq(affiliatePayouts.id, id)).limit(1);
    if (!beforeLock) return { error: "This payout is no longer actionable." };
    const [owner] = await tx.select({ userId: marketingAffiliates.userId }).from(marketingAffiliates).where(eq(marketingAffiliates.id, beforeLock.affiliateId)).limit(1);
    if (!owner) return { error: "Affiliate profile not found." };
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`affiliate-payout:${owner.userId}`}))`);
    const [payout] = await tx.select().from(affiliatePayouts).where(eq(affiliatePayouts.id, id)).for("update").limit(1);
    if (!payout || !["requested", "approved"].includes(payout.status)) return { error: "This payout is no longer actionable." };
    const items = await tx.select().from(affiliatePayoutItems).where(and(eq(affiliatePayoutItems.payoutId, payout.id), eq(affiliatePayoutItems.reserved, true)));
    if (items.length === 0) return { error: "Payout has no reserved eligible commissions." };
    const reservedTotal = items.reduce((sum, item) => sum + item.amountCents, 0);
    if (reservedTotal !== payout.amountCents) return { error: "Payout ledger amount does not match its reserved commissions." };
    const settings = (await loadAffiliateProgram(tx as unknown as DatabaseClient)).settings;
    const sources = await getAffiliateSources(tx as unknown as DatabaseClient, payout.affiliateId, settings.holdDays);
    const current = new Map(sources.sources.map(s => [`${s.kind}:${s.id}`, s]));
    const stillValid = items.every(item => {
      const source = current.get(`${item.sourceType}:${item.sourceId}`);
      return source?.status === "paid" && source.payoutStatus !== "pending" && source.commissionCents === item.amountCents
        && !!source.eligibleAt && new Date(source.eligibleAt).getTime() <= Date.now();
    });
    if (!stillValid) {
      await tx.update(affiliatePayouts).set({ status: "rejected", note: "One or more source orders are no longer eligible.", reviewedBy: adminId, reviewedAt: new Date(), updatedAt: new Date() }).where(eq(affiliatePayouts.id, payout.id));
      await tx.update(affiliatePayoutItems).set({ reserved: false }).where(eq(affiliatePayoutItems.payoutId, payout.id));
      return { error: "Source orders changed; payout rejected and commissions released." };
    }
    await tx.update(affiliatePayouts).set({ status, note, reference: status === "paid" ? reference : null, reviewedBy: adminId, reviewedAt: new Date(), paidAt: status === "paid" ? new Date() : null, updatedAt: new Date() }).where(eq(affiliatePayouts.id, payout.id));
    if (status === "rejected") await tx.update(affiliatePayoutItems).set({ reserved: false }).where(eq(affiliatePayoutItems.payoutId, payout.id));
    return { success: status === "paid" ? "External payment recorded." : `Payout ${status}.` };
  });
}

export function isMissingAffiliateSchema(error: unknown) {
  const seen = new Set<object>();
  const pending: unknown[] = [error];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);
    const e = current as { code?: unknown; message?: unknown; cause?: unknown; sourceError?: unknown };
    const missingAffiliateObject = /affiliate_|site_settings|marketing_affiliates|marketing_coupons|customer_subscriptions|workspace_projects/i.test(String(e.message));
    if ((e.code === "42P01" || e.code === "42703") && missingAffiliateObject) return true;
    // Drizzle and Postgres.js may wrap SQL errors under either property depending
    // on the runtime. Inspect both so an unapplied affiliate migration degrades
    // to the intended setup notice instead of taking down the whole route.
    pending.push(e.cause, e.sourceError);
  }
  return false;
}
