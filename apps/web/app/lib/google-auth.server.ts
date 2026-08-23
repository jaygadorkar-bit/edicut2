import { createCookie, redirect } from "react-router";
import { eq } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { users } from "@edicut/db/schema";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import type { DatabaseClient } from "@edicut/db/client";
import {
  commitAdminSession,
  createUserSession,
  getAdminSession,
} from "./session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./admin-paths";
import { verifyRecaptchaToken } from "./recaptcha.server";
import type { LoaderContext } from "../types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

type EnvSource = Record<string, string | undefined>;

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type GoogleOAuthMode = "user" | "admin";

const oauthStateCookie = createCookie("_edicut_google_oauth", {
  httpOnly: true,
  maxAge: 10 * 60,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
});

function parseEnvText(text: string): EnvSource {
  const env: EnvSource = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }

  return env;
}

function readLocalEnvFile(path: string): EnvSource {
  if (!globalThis.process?.versions?.node) return {};

  try {
    const filePath = resolveLocalFile(path);
    if (!filePath) return {};

    if (path.endsWith(".json")) {
      return JSON.parse(readFileSync(filePath, "utf8")) as EnvSource;
    }

    return parseEnvText(readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function resolveLocalFile(path: string) {
  let current = globalThis.process?.cwd?.() ?? ".";

  for (let index = 0; index < 5; index += 1) {
    const candidate = join(current, path);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return existsSync(path) ? path : null;
}

function readEnv(context?: LoaderContext): EnvSource {
  const cfEnv = context?.cf?.env ?? {};
  const nodeEnv = globalThis.process?.env ?? {};
  const viteEnv = typeof import.meta !== "undefined" ? (import.meta.env as EnvSource) : {};
  const localEnv = {
    ...readLocalEnvFile(".env.local"),
    ...readLocalEnvFile(".env"),
    ...readLocalEnvFile("secrets.json"),
  };

  return {
    ...localEnv,
    ...viteEnv,
    ...nodeEnv,
    ...cfEnv,
  };
}

function readRequiredGoogleEnv(context?: LoaderContext) {
  const env = readEnv(context);
  const clientId = firstPresent(env.AUTH_GOOGLE_ID, readLocalEnvFile("secrets.json").AUTH_GOOGLE_ID);
  const clientSecret = firstPresent(env.AUTH_GOOGLE_SECRET, readLocalEnvFile("secrets.json").AUTH_GOOGLE_SECRET);
  const appUrl = firstPresent(env.APP_URL, env.NEXT_PUBLIC_APP_URL, "http://localhost:3000")!;

  if (!clientId || !clientSecret) {
    throw new Response("Google sign-in is not configured.", { status: 503 });
  }

  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl.replace(/\/$/, "")}${GOOGLE_CALLBACK_PATH}`,
  };
}

function firstPresent(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeUserReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  if (value.startsWith("/auth/") || value.startsWith("/api/auth/")) {
    return "/dashboard";
  }

  return value;
}

function safeAdminReturnTo(value: string | null) {
  if (!value || !value.startsWith(ADMIN_BASE_PATH)) {
    return ADMIN_BASE_PATH;
  }

  if (value.startsWith(ADMIN_LOGIN_PATH) || value.includes("//")) {
    return ADMIN_BASE_PATH;
  }

  return value;
}

function getOAuthMode(requestUrl: URL): GoogleOAuthMode {
  return requestUrl.searchParams.get("mode") === "admin" ? "admin" : "user";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function createAdminOAuthCompletionResponse({
  request,
  context,
  userId,
  redirectTo,
}: {
  request: Request;
  context?: LoaderContext;
  userId: string;
  redirectTo: string;
}) {
  const session = await getAdminSession(request.headers.get("Cookie"), context);
  session.set("adminUserId", userId);

  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Referrer-Policy": "same-origin",
  });

  headers.append(
    "Set-Cookie",
    await commitAdminSession(session, { maxAge: 60 * 60 * 2 }, context)
  );
  headers.append("Set-Cookie", await oauthStateCookie.serialize("", { maxAge: 0 }));

  const destination = safeAdminReturnTo(redirectTo);

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex,nofollow">
    <meta http-equiv="refresh" content="0;url=${escapeHtml(destination)}">
    <title>Opening admin panel</title>
  </head>
  <body>
    <script>window.location.replace(${JSON.stringify(destination)});</script>
    <a href="${escapeHtml(destination)}">Continue to admin panel</a>
  </body>
</html>`,
    { headers }
  );
}

export async function startGoogleOAuth(request: Request, context?: LoaderContext) {
  const requestUrl = new URL(request.url);
  const formData = request.method === "POST" ? await request.clone().formData() : null;
  const captcha = await verifyRecaptchaToken({
    context,
    token: formData?.get("g-recaptcha-response") ?? requestUrl.searchParams.get("g-recaptcha-response"),
  });

  if (!captcha.success) {
    throw new Response(captcha.error, { status: 403 });
  }

  const { clientId, redirectUri } = readRequiredGoogleEnv(context);
  const mode = formData?.get("mode") === "admin" ? "admin" : getOAuthMode(requestUrl);
  const state = randomState();
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  const requestedReturnTo = typeof formData?.get("returnTo") === "string"
    ? String(formData.get("returnTo"))
    : requestUrl.searchParams.get("returnTo");
  const returnTo = mode === "admin"
    ? safeAdminReturnTo(requestedReturnTo)
    : safeUserReturnTo(requestedReturnTo);

  throw redirect(url.toString(), {
    headers: {
      "Set-Cookie": await oauthStateCookie.serialize({ mode, state, returnTo }),
    },
  });
}

export async function completeGoogleOAuth(request: Request, context: LoaderContext | undefined, db: DatabaseClient) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const stored = await oauthStateCookie.parse(request.headers.get("Cookie"));

  if (!code || !state || !stored?.state || state !== stored.state) {
    throw new Response("Invalid Google sign-in state.", { status: 400 });
  }

  const { clientId, clientSecret, redirectUri } = readRequiredGoogleEnv(context);
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Response("Google sign-in token exchange failed.", { status: 502 });
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: string };

  if (!tokenPayload.access_token) {
    throw new Response("Google sign-in did not return an access token.", { status: 502 });
  }

  const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });

  if (!profileResponse.ok) {
    throw new Response("Google profile lookup failed.", { status: 502 });
  }

  const profile = await profileResponse.json() as GoogleProfile;
  const email = profile.email?.trim().toLowerCase();

  if (!email || profile.email_verified === false) {
    throw new Response("Google account email is not verified.", { status: 403 });
  }

  if (stored.mode === "admin") {
    const adminUser = await findAdminUserByEmail(db, email);

    if (!adminUser || !adminUser.active) {
      throw new Response("Admin access is not available for this Google account.", { status: 403 });
    }

    return createAdminOAuthCompletionResponse({
      request,
      context,
      userId: adminUser.id,
      redirectTo: safeAdminReturnTo(typeof stored.returnTo === "string" ? stored.returnTo : null),
    });
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  const [user] = existing
    ? await db
        .update(users)
        .set({
          name: existing.name || profile.name || null,
          profileImageUrl: existing.profileImageUrl || profile.picture || null,
          active: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning()
    : await db
        .insert(users)
        .values({
          email,
          name: profile.name || null,
          profileImageUrl: profile.picture || null,
          active: true,
          role: "customer",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

  const adminUser = await findAdminUserByEmail(db, email);
  const response = await createUserSession({
    request,
    context,
    userId: user.id,
    remember: true,
    redirectTo: safeUserReturnTo(typeof stored.returnTo === "string" ? stored.returnTo : null),
    adminUserId: adminUser?.active ? adminUser.id : undefined,
  });

  response.headers.append("Set-Cookie", await oauthStateCookie.serialize("", { maxAge: 0 }));
  return response;
}
