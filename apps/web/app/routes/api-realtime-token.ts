import type { LoaderFunctionArgs } from "react-router";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../lib/db.server";
import { consumeUsageLimit } from "../lib/usage-protection.server";
import { readRealtimeAccessTokenClaims } from "../lib/realtime-auth.server";
import { getAdminSession, getSession, requireAdminUser, requireUserId } from "../lib/session.server";

const baseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Vary": "Cookie",
};

function safeDatabaseErrorCode(error: unknown) {
  const seen = new Set<object>();
  let current = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const item = current as { code?: unknown; cause?: unknown; sourceError?: unknown };
    if (typeof item.code === "string" && /^[A-Z0-9_]{2,32}$/.test(item.code)) return item.code;
    current = item.cause ?? item.sourceError;
  }
  return "UNKNOWN";
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  if (scope !== "admin" && scope !== "client") {
    return Response.json({ error: "Invalid Realtime scope." }, { status: 400, headers: baseHeaders });
  }

  const origin = request.headers.get("Origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== url.origin) {
        return Response.json({ error: "Cross-origin access is not allowed." }, { status: 403, headers: baseHeaders });
      }
    } catch {
      return Response.json({ error: "Cross-origin access is not allowed." }, { status: 403, headers: baseHeaders });
    }
  }

  try {
    const db = getDbFromContext(context);
    let accountId: string;
    let email: string;
    let accessToken: unknown;

    if (scope === "admin") {
      const admin = await requireAdminUser(request, db, context);
      const session = await getAdminSession(request.headers.get("Cookie"), context);
      accountId = admin.id;
      email = admin.email;
      accessToken = session.get("supabaseAccessToken");
    } else {
      accountId = await requireUserId(request, context);
      const user = await findUserById(db, accountId);
      if (!user?.active || user.deletedAt) {
        return Response.json({ error: "Permission denied." }, { status: 403, headers: baseHeaders });
      }
      const session = await getSession(request.headers.get("Cookie"), context);
      email = user.email;
      accessToken = session.get("supabaseAccessToken");
    }

    const limit = await consumeUsageLimit({
      request,
      context,
      bindingName: "USER_ACTION_LIMITER",
      key: `realtime-token:${scope}:${accountId}`,
      localLimit: 12,
      localPeriodSeconds: 60,
    });
    if (limit !== "allowed") {
      return Response.json(
        { error: "Realtime connection setup is temporarily limited." },
        { status: limit === "limited" ? 429 : 503, headers: baseHeaders },
      );
    }

    const claims = readRealtimeAccessTokenClaims(accessToken);
    if (!claims || claims.email !== email.trim().toLowerCase()) {
      // Legacy local-password sessions have no matching Supabase Auth token.
      // Their UI keeps the slower, cookie-authenticated refresh fallback.
      return new Response(null, { status: 204, headers: baseHeaders });
    }

    return Response.json({
      accessToken,
      topic: `edicut:${scope === "admin" ? "admin" : "user"}:${accountId}`,
      expiresAt: claims.expiresAt,
    }, { headers: baseHeaders });
  } catch (error) {
    if (error instanceof Response) {
      const location = error.headers.get("Location");
      if (location && new URL(location, request.url).href === request.url && error.headers.has("Set-Cookie")) {
        // Let fetch follow the auth helper's same-URL redirect after refresh.
        return error;
      }
      const setCookie = error.headers.get("Set-Cookie");
      return Response.json(
        { error: "Sign in again to enable live updates." },
        {
          status: error.status >= 400 ? error.status : 401,
          headers: { ...baseHeaders, ...(setCookie ? { "Set-Cookie": setCookie } : {}) },
        },
      );
    }
    console.error("Realtime token bootstrap failed.", { code: safeDatabaseErrorCode(error) });
    return Response.json({ error: "Live updates are unavailable." }, { status: 503, headers: baseHeaders });
  }
}
