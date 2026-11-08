import type { ActionFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { consumeUsageLimit, hashUsageLimitKey, limitRequestBody, rateLimitedResponse, requestTooLargeResponse } from "../lib/usage-protection.server";
import { normalizeAcquisitionBatch, normalizeInteractionBatch, writeSiteAcquisitionAggregates, writeSiteEngagedSession, writeSiteInteractionAggregates } from "../lib/site-analytics.server";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const consentCookie = request.headers.get("Cookie")?.split(";").some((cookie) => cookie.trim() === "edicut_analytics_consent=yes");
  if (!consentCookie) return new Response(null, { status: 204, headers });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return json({ error: "A JSON request body is required." }, 415);
  }

  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) return json({ error: "Cross-origin requests are not accepted." }, 403);
    } catch {
      return json({ error: "Cross-origin requests are not accepted." }, 403);
    }
  } else if (request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return json({ error: "Cross-origin requests are not accepted." }, 403);
  }

  const bounded = limitRequestBody(request, 8 * 1024);
  let body: unknown;
  try {
    const text = await bounded.request.text();
    if (bounded.exceeded()) return requestTooLargeResponse();
    body = JSON.parse(text);
  } catch {
    return json({ error: "Invalid analytics event data." }, 400);
  }

  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  const items = payload?.events === undefined ? [] : normalizeInteractionBatch(body);
  const acquisition = payload?.acquisition === undefined ? [] : normalizeAcquisitionBatch(body);
  const engagedSession = payload?.engagedSession === true;
  if (payload?.engagedSession !== undefined && payload.engagedSession !== true) return json({ error: "Invalid analytics event data." }, 400);
  const batchSize = items && acquisition ? items.length + acquisition.length + Number(engagedSession) : 0;
  if (!items || !acquisition || batchSize < 1 || batchSize > 20) return json({ error: "Invalid analytics event data." }, 400);

  const address = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await consumeUsageLimit({
    request,
    context,
    bindingName: "APP_MUTATION_LIMITER",
    key: `site-analytics:${await hashUsageLimitKey(address)}`,
    localLimit: 20,
    localPeriodSeconds: 60,
  });
  if (limit === "limited") return rateLimitedResponse();
  if (limit === "unavailable") return json({ error: "Analytics collection is temporarily unavailable." }, 503);

  try {
    const db = getDbFromContext(context);
    if (items.length) await writeSiteInteractionAggregates(db, items);
    if (acquisition.length) await writeSiteAcquisitionAggregates(db, acquisition);
    if (engagedSession) await writeSiteEngagedSession(db);
    return json({ ok: true }, 202);
  } catch {
    // Keep telemetry failures isolated from the public page and do not expose SQL details.
    return json({ error: "Analytics collection is not configured yet." }, 503);
  }
}
