import { createCookie } from "react-router";
import type { SessionContext } from "./session.server";

export const AFFILIATE_REFERRAL_COOKIE = "edicut_referral";
export const MARKETING_CONSENT_COOKIE = "edicut_marketing_consent";
const DAY = 86_400_000;
const LOCAL_SECRET = "local-dev-affiliate-referral-only";

export type AffiliateReferral = {
  code: string;
  visitId: string;
  campaign: string | null;
  landingPath: string;
  issuedAt: number;
  expiresAt: number;
};

function referralCookie(request: Request, context?: SessionContext) {
  const env = context?.cloudflare?.env ?? context?.cf?.env;
  const deployed = Boolean(env && env.NODE_ENV !== "development") || globalThis.process?.env?.NODE_ENV === "production";
  const secret = env?.SESSION_SECRET ?? globalThis.process?.env?.SESSION_SECRET;
  if (deployed && (!secret || secret === LOCAL_SECRET)) throw new Error("A production signing secret is required for affiliate attribution.");
  return createCookie(AFFILIATE_REFERRAL_COOKIE, {
    path: "/", httpOnly: true, sameSite: "lax",
    secure: deployed || new URL(request.url).protocol === "https:",
    secrets: [secret || LOCAL_SECRET],
  });
}

export function hasMarketingConsent(request: Request) {
  return (request.headers.get("Cookie") || "").split(";").some(part => part.trim() === `${MARKETING_CONSENT_COOKIE}=yes`);
}

export async function readAffiliateReferral(request: Request, context?: SessionContext, now = Date.now()): Promise<AffiliateReferral | null> {
  if (!hasMarketingConsent(request)) return null;
  const value = await referralCookie(request, context).parse(request.headers.get("Cookie"));
  if (!value || typeof value !== "object"
    || typeof value.code !== "string" || !/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(value.code)
    || typeof value.visitId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.visitId)
    || !(value.campaign === null || (typeof value.campaign === "string" && /^[a-z0-9-]{1,48}$/.test(value.campaign)))
    || typeof value.landingPath !== "string" || !isAffiliateLandingPath(value.landingPath)
    || !Number.isSafeInteger(value.issuedAt) || !Number.isSafeInteger(value.expiresAt)
    || value.issuedAt > now || value.expiresAt <= now || value.expiresAt <= value.issuedAt
    || value.expiresAt - value.issuedAt > 90 * DAY) return null;
  return value as AffiliateReferral;
}

export function isAffiliateLandingPath(path: string) {
  return path.length <= 160 && /^\/(?:$|pricing(?:\/[a-z0-9-]+)?$|services(?:\/[a-z0-9-]+)?$|portfolio$|blog(?:\/[a-z0-9-]+)?$|why-hire-us$|contact$)/.test(path);
}

export async function serializeAffiliateReferral(request: Request, context: SessionContext | undefined, referral: AffiliateReferral) {
  return referralCookie(request, context).serialize(referral, {
    expires: new Date(referral.expiresAt),
    maxAge: Math.max(0, Math.floor((referral.expiresAt - Date.now()) / 1000)),
  });
}

export function clearAffiliateReferral(request: Request, context?: SessionContext) {
  return referralCookie(request, context).serialize("", { maxAge: 0, expires: new Date(0) });
}

export function isReferralWithinWindow(referral: AffiliateReferral, attributionDays: number, now = Date.now()) {
  return referral.expiresAt > now && referral.issuedAt <= now && now - referral.issuedAt < attributionDays * DAY;
}
