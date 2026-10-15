import { createCookieSessionStorage, redirect } from "react-router";
import { findAdminUserById } from "@edicut/db/repositories/admin-users";
import { findAdminUserByEmail } from "@edicut/db/repositories/admin-users";
import type { DatabaseClient } from "@edicut/db/client";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "./db.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./admin-paths";
import {
  getSupabaseUserByAccessToken,
  refreshSupabaseSession,
  revokeSupabaseSession,
} from "../integrations/supabase/client.server";
import { adminUsers, users } from "@edicut/db/schema";
import { and, eq } from "drizzle-orm";

export type SessionContext = {
  cf?: { env?: Record<string, string | undefined> };
  cloudflare?: { env?: Record<string, string | undefined> };
};

const LOCAL_SESSION_SECRET = "local-dev-session-secret-change-in-production";
const USER_SESSION_SECONDS = 12 * 60 * 60;
const REMEMBERED_SESSION_SECONDS = 7 * 24 * 60 * 60;
const ADMIN_SESSION_SECONDS = 2 * 60 * 60;
const userStorageCache = new Map<string, ReturnType<typeof createCookieSessionStorage>>();
const adminStorageCache = new Map<string, ReturnType<typeof createCookieSessionStorage>>();

function readSessionSecret(context?: SessionContext) {
  const secret =
    context?.cf?.env?.SESSION_SECRET ??
    context?.cloudflare?.env?.SESSION_SECRET ??
    globalThis.process?.env?.SESSION_SECRET;

  if (secret && (!isSecureCookie(context) || secret !== LOCAL_SESSION_SECRET)) {
    return secret;
  }

  if (isSecureCookie(context)) {
    throw new Error("SESSION_SECRET is required in production.");
  }

  return LOCAL_SESSION_SECRET;
}

function isSecureCookie(context?: SessionContext) {
  const env = context?.cloudflare?.env ?? context?.cf?.env;
  // Workers do not promise a NODE_ENV value. A deployed runtime must fail closed.
  return globalThis.process?.env?.NODE_ENV === "production" || env?.NODE_ENV === "production"
    || Boolean(env && (env.NODE_ENV !== "development" || env.APP_URL?.startsWith("https://")));
}

function getUserSessionStorage(context?: SessionContext) {
  const secret = readSessionSecret(context);
  const cacheKey = `${secret}:${isSecureCookie(context)}`;
  const cached = userStorageCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const storage = createCookieSessionStorage({
    cookie: {
      name: "_session",
      sameSite: "lax",
      path: "/",
      httpOnly: true,
      secrets: [secret],
      secure: isSecureCookie(context),
    },
  });

  userStorageCache.set(cacheKey, storage);

  return storage;
}

function getAdminSessionStorage(context?: SessionContext) {
  const secret = `${readSessionSecret(context)}:admin`;
  const cacheKey = `${secret}:${isSecureCookie(context)}`;
  const cached = adminStorageCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const storage = createCookieSessionStorage({
    cookie: {
      name: "_edicut_admin",
      sameSite: "strict",
      path: "/",
      httpOnly: true,
      secrets: [secret],
      secure: isSecureCookie(context),
    },
  });

  adminStorageCache.set(cacheKey, storage);

  return storage;
}

type AppSession = any;

type CredentialIdentity = { id: string; email?: string | null; passwordHash?: string | null; sessionVersion?: string };
type SessionKind = "user" | "admin";

async function credentialKey(context?: SessionContext) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(readSessionSecret(context)), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
function credentialData(identity: CredentialIdentity, kind: SessionKind) {
  return new TextEncoder().encode(JSON.stringify([kind, identity.id, identity.email?.trim().toLowerCase(), identity.passwordHash ?? null, identity.sessionVersion ?? null]));
}
export async function getSessionCredentialVersion(identity: CredentialIdentity, context?: SessionContext, kind: SessionKind = "user") {
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await credentialKey(context), credentialData(identity, kind)));
  return btoa(String.fromCharCode(...signature)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}
export async function hasCurrentSessionCredentials(version: unknown, identity: CredentialIdentity, context?: SessionContext, kind: SessionKind = "user") {
  if (typeof version !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(version)) return false;
  const signature = Uint8Array.from(atob(version.replaceAll("-", "+").replaceAll("_", "/") + "="), character => character.charCodeAt(0));
  return crypto.subtle.verify("HMAC", await credentialKey(context), signature, credentialData(identity, kind));
}

function sessionHasExpired(session: AppSession, identityKey: string) {
  if (!session.has(identityKey)) return false;
  const expiresAt = session.get("authExpiresAt");
  return !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now();
}

async function prepareSession(session: AppSession, maximumSeconds: number, kind: SessionKind, context?: SessionContext) {
  const id = session.get(kind === "admin" ? "adminUserId" : "userId");
  if (typeof id !== "string" || !id) return;
  if (!session.has("authExpiresAt")) session.set("authExpiresAt", Date.now() + maximumSeconds * 1000);
  if (!session.has("authCredentialVersion")) {
    const db = getDbFromContext(context ?? {});
    const identity = kind === "admin" ? await findAdminUserById(db, id) : await findUserById(db, id);
    if (!identity) throw new Error("Cannot create a session for an unavailable account.");
    session.set("authCredentialVersion", await getSessionCredentialVersion(identity, context, kind));
  }
}

export async function getSession(cookieHeader: string | null, context?: SessionContext): Promise<AppSession> {
  const storage = getUserSessionStorage(context);
  const session = await storage.getSession(cookieHeader);
  // Old cookies without a signed deadline are invalidated instead of upgraded.
  return sessionHasExpired(session, "userId") ? storage.getSession() : session;
}

export async function commitSession(
  session: AppSession,
  options?: Parameters<ReturnType<typeof createCookieSessionStorage>["commitSession"]>[1],
  context?: SessionContext
) {
  const maximumSeconds = options?.maxAge === REMEMBERED_SESSION_SECONDS ? REMEMBERED_SESSION_SECONDS : USER_SESSION_SECONDS;
  await prepareSession(session, maximumSeconds, "user", context);
  if (!session.has("authExpiresAt")) return getUserSessionStorage(context).commitSession(session, options);
  const remaining = Math.max(0, Math.ceil((session.get("authExpiresAt") - Date.now()) / 1000));
  return getUserSessionStorage(context).commitSession(session, options?.maxAge === undefined ? options : { ...options, maxAge: Math.min(options.maxAge, remaining) });
}

export async function destroySession(
  session: AppSession,
  context?: SessionContext
) {
  return getUserSessionStorage(context).destroySession(session);
}

export async function getAdminSession(cookieHeader: string | null, context?: SessionContext): Promise<AppSession> {
  const storage = getAdminSessionStorage(context);
  const session = await storage.getSession(cookieHeader);
  return sessionHasExpired(session, "adminUserId") ? storage.getSession() : session;
}

export async function commitAdminSession(
  session: AppSession,
  options?: Parameters<ReturnType<typeof createCookieSessionStorage>["commitSession"]>[1],
  context?: SessionContext
) {
  await prepareSession(session, ADMIN_SESSION_SECONDS, "admin", context);
  if (!session.has("authExpiresAt")) return getAdminSessionStorage(context).commitSession(session, options);
  const remaining = Math.max(0, Math.ceil((session.get("authExpiresAt") - Date.now()) / 1000));
  return getAdminSessionStorage(context).commitSession(session, { ...options, maxAge: Math.min(options?.maxAge ?? ADMIN_SESSION_SECONDS, remaining) });
}

export async function destroyAdminSession(
  session: AppSession,
  context?: SessionContext
) {
  return getAdminSessionStorage(context).destroySession(session);
}

/** End provider sessions and revoke all application cookies for these identities. */
export async function revokeAuthenticatedSessions(session: AppSession, adminSession: AppSession, context?: SessionContext) {
  const db = session.has("userId") || adminSession.has("adminUserId") ? getDbFromContext(context ?? {}) : null;
  const revoke = async (current: AppSession, kind: SessionKind) => {
    const id = current.get(kind === "admin" ? "adminUserId" : "userId");
    if (!db || typeof id !== "string" || !id) return;
    const identity = kind === "admin" ? await findAdminUserById(db, id) : await findUserById(db, id);
    if (!identity || !await hasCurrentSessionCredentials(current.get("authCredentialVersion"), identity, context, kind)) return;
    if (!identity.sessionVersion) throw new Error("Session revocation migration is required.");
    await revokeSupabaseSession(context, current.get("supabaseAccessToken"), current.get("supabaseRefreshToken"));
    const table = kind === "admin" ? adminUsers : users;
    // A replay of an already-revoked cookie cannot invalidate a newer login.
    await db.update(table).set({ sessionVersion: crypto.randomUUID() })
      .where(and(eq(table.id, id), eq(table.sessionVersion, identity.sessionVersion)));
  };
  await Promise.all([revoke(session, "user"), revoke(adminSession, "admin")]);
}

export async function requireUserId(
  request: Request,
  context?: SessionContext,
  redirectTo: string = new URL(request.url).pathname
) {
  const session = await getSession(request.headers.get("Cookie"), context);
  const userId = session.get("userId");

  const accessToken = session.get("supabaseAccessToken");
  if (typeof accessToken === "string" && accessToken.length > 0) {
    const user = await getSupabaseUserByAccessToken(context, accessToken);
    if (!user) {
      const refreshToken = session.get("supabaseRefreshToken");
      if (typeof refreshToken === "string" && refreshToken.length > 0) {
        const refreshed = await refreshSupabaseSession(context, refreshToken);
        if (refreshed) {
          session.set("userId", typeof userId === "string" ? userId : refreshed.user.id);
          session.set("supabaseAccessToken", refreshed.session.access_token);
          session.set("supabaseRefreshToken", refreshed.session.refresh_token);
          throw redirect(request.url, {
            headers: {
              "Set-Cookie": await commitSession(session, undefined, context),
            },
          });
        }
      }

      const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
      throw redirect(`/signin?${searchParams}`, {
        headers: { "Set-Cookie": await destroySession(session, context) },
      });
    }
    const profileId = typeof userId === "string" ? userId : user.id;
    const profile = await findUserById(getDbFromContext(context ?? {}), profileId);
    if (!profile?.active || profile.deletedAt || !await hasCurrentSessionCredentials(session.get("authCredentialVersion"), profile, context)) {
      const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
      throw redirect(`/signin?${searchParams}`, {
        headers: { "Set-Cookie": await destroySession(session, context) },
      });
    }

    if (typeof userId === "string" && userId !== user.id) {
      if (!user.email_confirmed_at || !user.email || profile.email.toLowerCase() !== user.email.trim().toLowerCase()) {
        throw redirect("/signin", {
          headers: { "Set-Cookie": await destroySession(session, context) },
        });
      }
      return profile.id;
    }
    return user.id;
  }

  if (!userId || typeof userId !== "string") {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/signin?${searchParams}`);
  }
  const profile = await findUserById(getDbFromContext(context ?? {}), userId);
  if (!profile?.active || profile.deletedAt || !await hasCurrentSessionCredentials(session.get("authCredentialVersion"), profile, context)) {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/signin?${searchParams}`, {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }
  return userId;
}

export async function createUserSession({
  request,
  context,
  userId,
  remember,
  redirectTo,
  accessToken,
  refreshToken,
  adminUserId,
  adminAccessVerified,
}: {
  request: Request;
  context?: SessionContext;
  userId: string;
  remember: boolean;
  redirectTo: string;
  accessToken?: string;
  refreshToken?: string;
  adminUserId?: string;
  adminAccessVerified?: boolean;
}) {
  const session = await getSession(null, context);
  session.set("userId", userId);
  session.unset("supabaseAccessToken");
  session.unset("supabaseRefreshToken");
  if (accessToken) session.set("supabaseAccessToken", accessToken);
  if (refreshToken) session.set("supabaseRefreshToken", refreshToken);
  if (adminUserId && adminAccessVerified) {
    const admin = await findAdminUserById(getDbFromContext(context ?? {}), adminUserId);
    if (admin?.active && isAdminRole(admin.role)) {
      session.set("adminUserId", adminUserId);
      session.set("adminAccessVerified", true);
      session.set("adminCredentialVersion", await getSessionCredentialVersion(admin, context, "admin"));
    }
  } else {
    session.unset("adminUserId");
    session.unset("adminAccessVerified");
  }
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitSession(session, {
        maxAge: remember
          ? 60 * 60 * 24 * 7 // 7 days
          : undefined, // session cookie
      }, context),
    },
  });
}

export function isAdminRole(role: string) {
  return role === "admin";
}

export async function requireAdminUser(
  request: Request,
  db: DatabaseClient,
  context?: SessionContext,
  redirectTo: string = new URL(request.url).pathname
) {
  const session = await getAdminSession(request.headers.get("Cookie"), context);
  const adminUserId = session.get("adminUserId");

  const accessToken = session.get("supabaseAccessToken");
  if (typeof accessToken === "string" && accessToken.length > 0) {
    const authUser = await getSupabaseUserByAccessToken(context, accessToken);
    if (!authUser?.email || !authUser.email_confirmed_at) {
      const refreshToken = session.get("supabaseRefreshToken");
      if (typeof refreshToken === "string" && refreshToken.length > 0) {
        const refreshed = await refreshSupabaseSession(context, refreshToken);
        if (refreshed?.user.email && refreshed.user.email_confirmed_at) {
          session.set("supabaseAccessToken", refreshed.session.access_token);
          session.set("supabaseRefreshToken", refreshed.session.refresh_token);
          throw redirect(request.url, {
            headers: {
              "Set-Cookie": await commitAdminSession(session, undefined, context),
            },
          });
        }
      }

      throw redirect(ADMIN_LOGIN_PATH);
    }

    const supabaseAdmin = await findAdminUserByEmail(db, authUser.email);
    if (supabaseAdmin?.active && isAdminRole(supabaseAdmin.role) && await hasCurrentSessionCredentials(session.get("authCredentialVersion"), supabaseAdmin, context, "admin")) {
      return supabaseAdmin;
    }

    throw redirect(ADMIN_LOGIN_PATH);
  }

  if (!adminUserId || typeof adminUserId !== "string") {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`${ADMIN_LOGIN_PATH}?${searchParams}`);
  }

  const user = await findAdminUserById(db, adminUserId);

  if (!user || !user.active || !isAdminRole(user.role) || !await hasCurrentSessionCredentials(session.get("authCredentialVersion"), user, context, "admin")) {
    throw redirect(ADMIN_LOGIN_PATH);
  }

  return user;
}

export async function createAdminSession({
  request,
  context,
  userId,
  redirectTo,
  accessToken,
  refreshToken,
}: {
  request: Request;
  context?: SessionContext;
  userId: string;
  redirectTo: string;
  accessToken?: string;
  refreshToken?: string;
}) {
  const session = await getAdminSession(null, context);
  session.set("adminUserId", userId);
  session.unset("supabaseAccessToken");
  session.unset("supabaseRefreshToken");
  if (accessToken) session.set("supabaseAccessToken", accessToken);
  if (refreshToken) session.set("supabaseRefreshToken", refreshToken);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitAdminSession(session, {
        maxAge: 60 * 60 * 2,
      }, context),
    },
  });
}
