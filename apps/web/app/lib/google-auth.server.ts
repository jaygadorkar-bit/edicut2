import { safeAdminRedirect, safeRedirectPath } from "./safe-redirect";
import { redirect } from "react-router";
import { and, eq, isNull, sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { users } from "@edicut/db/schema";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import type { DatabaseClient } from "@edicut/db/client";
import { fetchWithTimeout } from "@edicut/shared/server-fetch";
import {
  commitAdminSession,
  createUserSession,
  getAdminSession,
  getGoogleOAuthCookie,
  isAdminRole,
} from "./session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./admin-paths";
import { retryDatabaseRead } from "./database-errors";
import type { LoaderContext } from "../types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";

type EnvSource = Record<string, string | undefined>;

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  picture?: string;
};
type VerifiedGoogleProfile = { email: string; name: string | null; picture: string | null };

type GoogleOAuthMode = "user" | "admin";

const transactionLifetimeMs = 600_000;
const privateHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};
type GoogleError = "google-unavailable" | "google-state" | "google-cancelled" | "google-email" | "account-unavailable";
type OAuthTransaction = {
  mode: GoogleOAuthMode;
  state: string;
  verifier: string;
  expiresAt: number;
  returnTo: string;
};

function parseEnvText(text: string): EnvSource {
  const env: EnvSource = {};

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    const value = match[2].replace(/^["']|["']$/g, "").trim();
    if (value) env[match[1]] = value;
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
  if (context?.cf?.env) return context.cf.env;
  const nodeEnv = globalThis.process?.env ?? {};
  const viteEnv = typeof import.meta !== "undefined" ? (import.meta.env as EnvSource) : {};
  const localEnv = {
    ...readLocalEnvFile(".env"),
    ...readLocalEnvFile(".env.local"),
    ...readLocalEnvFile("secrets.json"),
  };

  return {
    ...localEnv,
    ...viteEnv,
    ...nodeEnv,
  };
}

function configuredAppUrl(env: EnvSource) {
  return firstPresent(env.APP_URL, env.NEXT_PUBLIC_APP_URL, "http://localhost:3002")!;
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

export function readRequiredGoogleEnv(context?: LoaderContext) {
  const env = readEnv(context);
  const clientId = firstPresent(env.AUTH_GOOGLE_ID);
  const clientSecret = firstPresent(env.AUTH_GOOGLE_SECRET);

  if (!clientId || !clientSecret) {
    throw new Response("Google sign-in is not configured.", { status: 503 });
  }

  const appUrl = new URL(configuredAppUrl(env));
  const callback = new URL(firstPresent(env.AUTH_GOOGLE_REDIRECT_URI) ?? GOOGLE_CALLBACK_PATH, appUrl);
  if (appUrl.username || appUrl.password || (appUrl.protocol !== "https:" &&
    !(appUrl.protocol === "http:" && isLoopbackHostname(appUrl.hostname))) ||
    callback.origin !== appUrl.origin || callback.pathname !== GOOGLE_CALLBACK_PATH ||
    callback.username || callback.password || callback.search || callback.hash) {
    throw new Response("Google sign-in callback is not configured correctly.", { status: 503 });
  }
  return { clientId, clientSecret, appUrl: appUrl.origin, redirectUri: callback.href };
}

function firstPresent(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0);
}

function randomHex() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundedReturnTo(value: unknown) {
  return typeof value === "string" && new TextEncoder().encode(value).length <= 1024 ? value : null;
}

function safeUserReturnTo(value: unknown) {
  const destination = boundedReturnTo(safeRedirectPath(value)) ?? "/dashboard";
  try {
    const pathname = decodeURIComponent(new URL(destination, "https://redirect.invalid").pathname);
    return /^(?:\/auth|\/api\/auth|\/signin|\/signout)(?:\/|$)/i.test(pathname) ? "/dashboard" : destination;
  } catch {
    return "/dashboard";
  }
}

function safeAdminReturnTo(value: unknown) {
  return boundedReturnTo(safeAdminRedirect(value)) ?? ADMIN_BASE_PATH;
}

async function readTransaction(request: Request, context?: LoaderContext): Promise<OAuthTransaction | null> {
  try {
    const stored = await getGoogleOAuthCookie(context).parse(request.headers.get("Cookie"));
    if ((stored?.mode !== "user" && stored?.mode !== "admin") ||
      typeof stored.state !== "string" || !/^[a-f0-9]{64}$/.test(stored.state) ||
      typeof stored.verifier !== "string" || !/^[a-f0-9]{64}$/.test(stored.verifier) ||
      !Number.isSafeInteger(stored.expiresAt) || typeof stored.returnTo !== "string") return null;
    return stored;
  } catch {
    return null;
  }
}

export function googleSignInPath(mode: GoogleOAuthMode, returnTo: string | null, error?: GoogleError) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  if (returnTo) params.set("redirectTo", mode === "admin" ? safeAdminReturnTo(returnTo) : safeUserReturnTo(returnTo));
  return `${mode === "admin" ? ADMIN_LOGIN_PATH : "/signin"}${params.size ? `?${params}` : ""}`;
}

export async function createGoogleOAuthFailureResponse(request: Request, context?: LoaderContext, error: GoogleError = "google-unavailable") {
  const stored = await readTransaction(request, context);
  return googleFailure(stored, new URL(request.url).searchParams.get("state"), context, error);
}

async function googleFailure(stored: OAuthTransaction | null, state: string | null, context: LoaderContext | undefined, error: GoogleError) {
  const headers = new Headers(privateHeaders);
  // An unrelated or stale callback must not erase a newer attempt.
  if (stored && state === stored.state) {
    headers.append("Set-Cookie", await getGoogleOAuthCookie(context).serialize("", { maxAge: 0 }));
  }
  return redirect(googleSignInPath(stored?.mode ?? "user", stored?.returnTo ?? null, error), { headers });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function navigationPage(destination: string, title: string, link: string, headers: Headers, back?: string) {
  const href = escapeHtml(destination);
  headers.set("Content-Type", "text/html; charset=utf-8");
  // Use the HTTP Refresh header as well as the HTML fallback. Some embedded
  // browsers keep the provider's account chooser active unless navigation is
  // issued directly by the response.
  headers.set("Refresh", `0; url=${destination}`);
  return new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="0;url=${href}">
    <title>${escapeHtml(title)} · EdiCut</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p><a href="${href}">${escapeHtml(link)}</a></p>
      ${back ? `<p><a href="${escapeHtml(back)}">Back to EdiCut sign-in</a></p>` : ""}
    </main>
  </body>
</html>`, { headers });
}

async function createAdminOAuthCompletionResponse({
  context,
  userId,
  redirectTo,
  appUrl,
  profile,
}: {
  context?: LoaderContext;
  userId: string;
  redirectTo: string;
  appUrl: string;
  profile: VerifiedGoogleProfile;
}) {
  const session = await getAdminSession(null, context);
  session.set("adminUserId", userId);
  session.set("profileEmail", profile.email);
  session.set("profileImageUrl", profile.picture);

  const headers = new Headers(privateHeaders);

  headers.append(
    "Set-Cookie",
    await commitAdminSession(session, { maxAge: 60 * 60 * 2 }, context)
  );
  headers.append("Set-Cookie", await getGoogleOAuthCookie(context).serialize("", { maxAge: 0 }));

  // A new document ends Google's redirect chain before sending the Strict admin cookie.
  return navigationPage(new URL(redirectTo, appUrl).href, "Opening admin panel", "Continue to admin panel", headers);
}

export async function startGoogleOAuth(request: Request, context: LoaderContext | undefined, formData: FormData) {
  const requestUrl = new URL(request.url);
  const mode = formData.get("mode") === "admin" ? "admin" : "user";
  const requestedReturnTo = formData.get("returnTo");
  const returnTo = mode === "admin"
    ? safeAdminReturnTo(requestedReturnTo)
    : safeUserReturnTo(requestedReturnTo);
  const { clientId, appUrl, redirectUri } = readRequiredGoogleEnv(context);
  if (requestUrl.origin !== appUrl) {
    return redirect(new URL(googleSignInPath(mode, returnTo), appUrl).href, { status: 303, headers: privateHeaders });
  }

  const state = randomHex();
  const verifier = randomHex();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  // End the form navigation before starting the cross-origin OAuth navigation.
  const headers = new Headers(privateHeaders);
  headers.append("Set-Cookie", await getGoogleOAuthCookie(context).serialize({ mode, state, verifier, expiresAt: Date.now() + transactionLifetimeMs, returnTo }));
  return redirect(url.href, { status: 303, headers });
}

export async function completeGoogleOAuth(
  request: Request,
  context: LoaderContext | undefined,
  getDb: () => DatabaseClient,
  onStage: (stage: string) => void = () => {},
) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const stored = await readTransaction(request, context);
  const fail = (error: GoogleError) => googleFailure(stored, state, context, error);

  if (!stored || state !== stored.state || stored.expiresAt <= Date.now()) {
    return fail("google-state");
  }
  if (requestUrl.searchParams.has("error") || !code) {
    return fail(requestUrl.searchParams.get("error") === "access_denied" ? "google-cancelled" : "google-unavailable");
  }

  const { clientId, clientSecret, redirectUri, appUrl } = readRequiredGoogleEnv(context);
  const signal = AbortSignal.timeout(10_000);
  onStage("token-exchange");
  const tokenResponse = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: "POST",
    signal,
    // Workers supports manual redirects. Treat any 3xx as a failed exchange
    // so credentials cannot be forwarded to a different destination.
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: stored.verifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Response("Google sign-in token exchange failed.", { status: 502 });
  }

  const tokenPayload = await tokenResponse.json() as { access_token?: unknown } | null;

  if (typeof tokenPayload?.access_token !== "string" || !tokenPayload.access_token) {
    throw new Response("Google sign-in did not return an access token.", { status: 502 });
  }

  onStage("profile-lookup");
  const profileResponse = await fetchWithTimeout(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
    signal,
    redirect: "manual",
  });

  if (!profileResponse.ok) {
    throw new Response("Google profile lookup failed.", { status: 502 });
  }

  const profile = await profileResponse.json() as GoogleProfile;
  const email = typeof profile?.email === "string" ? profile.email.trim().toLowerCase() : "";

  // These accounts are linked by email, so Google must be authoritative for it.
  if (!/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254 || profile.email_verified !== true ||
    (!email.endsWith("@gmail.com") && !(typeof profile.hd === "string" && profile.hd.trim()))) {
    return fail("google-email");
  }
  const name = typeof profile.name === "string" ? profile.name.trim().slice(0, 200) || null : null;
  const picture = typeof profile.picture === "string" && profile.picture.startsWith("https://") && profile.picture.length <= 2048 ? profile.picture : null;
  onStage("database-config");
  const db = getDb();

  if (stored.mode === "admin") {
    onStage("admin-lookup");
    const adminUser = await retryDatabaseRead(() => findAdminUserByEmail(db, email));

    if (!adminUser?.active || !isAdminRole(adminUser.role)) {
      return fail("account-unavailable");
    }

    onStage("admin-session");
    return createAdminOAuthCompletionResponse({
      context,
      userId: adminUser.id,
      redirectTo: safeAdminReturnTo(stored.returnTo),
      appUrl,
      profile: { email, name, picture },
    });
  }

  onStage("customer-lookup");
  const findProfiles = (client: Pick<DatabaseClient, "query">) => client.query.users.findMany({
    where: sql`lower(btrim(${users.email})) = ${email}`,
    limit: 2,
  });
  let matches = await retryDatabaseRead(() => findProfiles(db));
  if (!matches.length) {
    onStage("customer-create");
    matches = await db.transaction(async tx => {
      // The schema permits duplicate emails. Serialize new Google profiles
      // for this email and recheck before inserting.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`edicut:google:${email}`}, 0))`);
      const concurrent = await findProfiles(tx);
      if (concurrent.length) return concurrent;
      return tx.insert(users).values({ email, name, profileImageUrl: picture, role: "customer" }).returning();
    });
  }
  const [user] = matches;
  if (matches.length !== 1 || !user?.active || user.deletedAt) return fail("account-unavailable");

  if ((!user.name && name) || (!user.profileImageUrl && picture)) {
    onStage("customer-profile");
    const [updated] = await db.update(users).set({
      name: sql`coalesce(nullif(${users.name}, ''), ${name})`,
      profileImageUrl: sql`coalesce(nullif(${users.profileImageUrl}, ''), ${picture})`,
      updatedAt: new Date(),
    }).where(and(eq(users.id, user.id), eq(users.active, true), isNull(users.deletedAt))).returning({ id: users.id });
    if (!updated) return fail("account-unavailable");
  }

  onStage("admin-lookup");
  const adminUser = await retryDatabaseRead(() => findAdminUserByEmail(db, email));
  const verifiedAdminIdentity = Boolean(adminUser?.active && isAdminRole(adminUser.role));
  onStage("customer-session");
  const destination = new URL(safeUserReturnTo(stored.returnTo), appUrl).href;
  const response = await createUserSession({
    request,
    context,
    userId: user.id,
    remember: true,
    redirectTo: destination,
    adminUserId: verifiedAdminIdentity ? adminUser?.id : undefined,
    adminAccessVerified: verifiedAdminIdentity,
  });

  const headers = new Headers(response.headers);
  headers.delete("Location");
  for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
  headers.append("Set-Cookie", await getGoogleOAuthCookie(context).serialize("", { maxAge: 0 }));
  return redirect(destination, { status: 303, headers });
}
