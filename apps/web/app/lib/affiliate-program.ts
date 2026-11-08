/** Browser-safe contracts and validation helpers for the affiliate program. */
export type AffiliateProgramSettings = {
  attributionDays: number;
  holdDays: number;
  minimumPayoutCents: number;
  payoutsEnabled: boolean;
  applicationsOpen: boolean;
};

export const DEFAULT_AFFILIATE_PROGRAM_SETTINGS: AffiliateProgramSettings = {
  attributionDays: 30,
  holdDays: 30,
  minimumPayoutCents: 5000,
  payoutsEnabled: false,
  applicationsOpen: true,
};

export type AffiliateApplicationStatus = "pending" | "approved" | "rejected";
export type AffiliatePayoutStatus = "requested" | "approved" | "paid" | "rejected" | "cancelled";
export type AffiliatePayoutMethod = "paypal" | "manual";
export type AffiliateBalance = {
  earnedCents: number;
  pendingCents: number;
  estimatedCents: number;
  availableCents: number;
  reservedCents: number;
  paidCents: number;
  clawbackCents: number;
};
export type AffiliateProgramResult = { success?: string; error?: string };

export type AffiliateApplicationInput = {
  whatsappPhone: string;
  socialMedia?: string;
  promotionPlan: string;
};
export type AffiliateApplicationView = {
  id: string;
  channelUrl: string | null;
  audience: string | null;
  whatsappPhone: string | null;
  socialMedia: string | null;
  promotionPlan: string;
  status: AffiliateApplicationStatus;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};
export type AffiliateVisitView = { id: string; campaign: string | null; landingPath: string; createdAt: string };
export type AffiliatePayoutInput = { method: AffiliatePayoutMethod; destination: string };
export type AffiliatePayoutView = {
  id: string;
  amountCents: number;
  method: AffiliatePayoutMethod;
  destination: string;
  status: AffiliatePayoutStatus;
  reference: string | null;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
};
export type AffiliatePartnerOrderView = {
  id: string;
  kind: "project" | "subscription";
  label: string;
  status: string;
  createdAt: string;
  paidAt: string | null;
  currency: string;
  amountCents: number;
  commissionCents: number;
  eligibleAt: string | null;
  payoutStatus: "available" | "pending" | "reserved" | "paid" | "reversed";
};
export type AffiliateCampaignView = { campaign: string | null; visits: number; referralUrl: string };
export type PartnerAffiliateProgramView = {
  schemaReady: boolean;
  settings: AffiliateProgramSettings;
  application: AffiliateApplicationView | null;
  code: string | null;
  commissionRateBps: number | null;
  couponCode: string | null;
  discountRateBps: number | null;
  active: boolean;
  referralUrl: string | null;
  campaigns: AffiliateCampaignView[];
  visits: AffiliateVisitView[];
  payouts: AffiliatePayoutView[];
  balance: AffiliateBalance;
  orders: AffiliatePartnerOrderView[];
};
export type AdminAffiliateProgramView = {
  schemaReady: boolean;
  settings: AffiliateProgramSettings;
  applications: (AffiliateApplicationView & { userId: string; name: string; email: string })[];
  payouts: (AffiliatePayoutView & { affiliateId: string; userId: string; name: string; email: string })[];
  visitCount: number;
};

export function parseAffiliateSettings(value: string | null | undefined): AffiliateProgramSettings {
  if (!value) return { ...DEFAULT_AFFILIATE_PROGRAM_SETTINGS };
  try {
    const parsed = JSON.parse(value) as Partial<AffiliateProgramSettings>;
    const integer = (candidate: unknown, fallback: number, min: number, max: number) =>
      Number.isSafeInteger(candidate) && Number(candidate) >= min && Number(candidate) <= max ? Number(candidate) : fallback;
    return {
      attributionDays: integer(parsed.attributionDays, 30, 1, 90),
      holdDays: integer(parsed.holdDays, 30, 0, 180),
      minimumPayoutCents: integer(parsed.minimumPayoutCents, 5000, 500, 10000000),
      payoutsEnabled: parsed.payoutsEnabled === true,
      applicationsOpen: parsed.applicationsOpen !== false,
    };
  } catch { return { ...DEFAULT_AFFILIATE_PROGRAM_SETTINGS }; }
}

export function normalizeAffiliateCampaign(value: string | null | undefined) {
  if (!value?.trim()) return null;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return normalized || null;
}

export function calculateAffiliateCommissionCents(amountCents: number, rateBps: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps > 10000) return 0;
  const result = (BigInt(amountCents) * BigInt(rateBps) + BigInt(5000)) / BigInt(10000);
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : 0;
}

export function normalizeWhatsAppPhone(value: string | null | undefined) {
  if (!value?.trim() || !/^\+[1-9][0-9 .()-]{6,22}$/.test(value.trim())) return null;
  const normalized = `+${value.trim().slice(1).replace(/[ .()-]/g, "")}`;
  return /^\+[1-9][0-9]{6,14}$/.test(normalized) ? normalized : null;
}

/** Accept up to five HTTPS social-profile links, one per line. */
export function normalizeAffiliateSocialMedia(value: string | null | undefined): string | null | undefined {
  const links = (value ?? "").split(/\r?\n/).map(link => link.trim()).filter(Boolean);
  if (!links.length) return null;
  if (links.length > 5) return undefined;
  const normalized: string[] = [];
  for (const link of links) {
    if (link.length > 512) return undefined;
    try {
      const url = new URL(link);
      if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return undefined;
      normalized.push(url.toString());
    } catch { return undefined; }
  }
  const result = normalized.join("\n");
  return result.length <= 2000 ? result : undefined;
}
