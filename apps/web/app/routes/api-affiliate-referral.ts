import type { ActionFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { getSession } from "../lib/session.server";
import { consumeUsageLimit, hashUsageLimitKey } from "../lib/usage-protection.server";
import { isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { normalizeMarketingCode } from "../lib/marketing.server";
import { loadAffiliateProgram, recordAffiliateVisit, isMissingAffiliateSchema } from "../lib/affiliate-program.server";
import { normalizeAffiliateCampaign } from "../lib/affiliate-program";
import { clearAffiliateReferral, hasMarketingConsent, isAffiliateLandingPath, isReferralWithinWindow, readAffiliateReferral, serializeAffiliateReferral } from "../lib/affiliate-referral.server";

const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" };
export function loader() { return new Response("Method not allowed", { status: 405, headers: { ...privateHeaders, Allow: "POST" } }); }

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return new Response("Forbidden", { status: 403, headers: privateHeaders });
  const form = await readMutationForm(request, 2048);
  if (!form) return new Response("Invalid referral request", { status: 400, headers: privateHeaders });
  if (form.get("intent") === "clear" || !hasMarketingConsent(request)) {
    return new Response(null, { status: 204, headers: { ...privateHeaders, "Set-Cookie": await clearAffiliateReferral(request, context) } });
  }
  const code = normalizeMarketingCode(String(form.get("ref") || ""));
  const landingPath = String(form.get("landingPath") || "");
  const campaign = normalizeAffiliateCampaign(String(form.get("campaign") || ""));
  if (!code || !isAffiliateLandingPath(landingPath)) return new Response("Invalid referral", { status: 400, headers: privateHeaders });
  const address = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = await consumeUsageLimit({ context, request, bindingName: "USER_ACTION_LIMITER", key: `affiliate-visit:${await hashUsageLimitKey(address)}`, localLimit: 20, localPeriodSeconds: 60 });
  if (limit !== "allowed") return new Response("Referral tracking unavailable", { status: 429, headers: privateHeaders });
  try {
    const db = getDbFromContext(context);
    const { settings } = await loadAffiliateProgram(db);
    const existing = await readAffiliateReferral(request, context);
    if (existing?.code === code && existing.campaign === campaign && existing.landingPath === landingPath && isReferralWithinWindow(existing, settings.attributionDays)) {
      return new Response(null, { status: 204, headers: privateHeaders });
    }
    const session = await getSession(request.headers.get("Cookie"), context);
    const visitId = await recordAffiliateVisit(db, { code, campaign, landingPath, userId: session.get("userId") });
    if (!visitId) return new Response(null, { status: 204, headers: privateHeaders });
    const issuedAt = Date.now();
    const cookie = await serializeAffiliateReferral(request, context, { code, visitId, campaign, landingPath, issuedAt, expiresAt: issuedAt + settings.attributionDays * 86_400_000 });
    return new Response(null, { status: 204, headers: { ...privateHeaders, "Set-Cookie": cookie } });
  } catch (error) {
    if (!isMissingAffiliateSchema(error)) console.error("Affiliate referral tracking unavailable");
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
