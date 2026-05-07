import { createCookieSessionStorage, redirect } from "react-router";
import { findAdminUserById } from "@edicut/db/repositories/admin-users";
import type { DatabaseClient } from "@edicut/db/client";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./admin-paths";

type SessionContext = {
  cf?: { env?: Record<string, string | undefined> };
  cloudflare?: { env?: Record<string, string | undefined> };
};

const LOCAL_SESSION_SECRET = "local-dev-session-secret-change-in-production";
const userStorageCache = new Map<string, ReturnType<typeof createCookieSessionStorage>>();
const adminStorageCache = new Map<string, ReturnType<typeof createCookieSessionStorage>>();

function readSessionSecret(context?: SessionContext) {
  const secret =
    context?.cf?.env?.SESSION_SECRET ??
    context?.cloudflare?.env?.SESSION_SECRET ??
    globalThis.process?.env?.SESSION_SECRET;

  if (secret) {
    return secret;
  }

  if (globalThis.process?.env?.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }

  return LOCAL_SESSION_SECRET;
}

function isSecureCookie() {
  return globalThis.process?.env?.NODE_ENV === "production";
}

function getUserSessionStorage(context?: SessionContext) {
  const secret = readSessionSecret(context);
  const cacheKey = `${secret}:${isSecureCookie()}`;
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
      secure: isSecureCookie(),
    },
  });

  userStorageCache.set(cacheKey, storage);

  return storage;
}

function getAdminSessionStorage(context?: SessionContext) {
  const secret = `${readSessionSecret(context)}:admin`;
  const cacheKey = `${secret}:${isSecureCookie()}`;
  const cached = adminStorageCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const storage = createCookieSessionStorage({
    cookie: {
      name: "_edicut_admin",
      sameSite: "strict",
      path: ADMIN_BASE_PATH,
      httpOnly: true,
      secrets: [secret],
      secure: isSecureCookie(),
    },
  });

  adminStorageCache.set(cacheKey, storage);

  return storage;
}

type AppSession = any;

export async function getSession(cookieHeader: string | null, context?: SessionContext): Promise<AppSession> {
  return getUserSessionStorage(context).getSession(cookieHeader);
}

export async function commitSession(
  session: AppSession,
  options?: Parameters<ReturnType<typeof createCookieSessionStorage>["commitSession"]>[1],
  context?: SessionContext
) {
  return getUserSessionStorage(context).commitSession(session, options);
}

export async function destroySession(
  session: AppSession,
  context?: SessionContext
) {
  return getUserSessionStorage(context).destroySession(session);
}

export async function getAdminSession(cookieHeader: string | null, context?: SessionContext): Promise<AppSession> {
  return getAdminSessionStorage(context).getSession(cookieHeader);
}

export async function commitAdminSession(
  session: AppSession,
  options?: Parameters<ReturnType<typeof createCookieSessionStorage>["commitSession"]>[1],
  context?: SessionContext
) {
  return getAdminSessionStorage(context).commitSession(session, options);
}

export async function destroyAdminSession(
  session: AppSession,
  context?: SessionContext
) {
  return getAdminSessionStorage(context).destroySession(session);
}

export async function requireUserId(
  request: Request,
  context?: SessionContext,
  redirectTo: string = new URL(request.url).pathname
) {
  const session = await getSession(request.headers.get("Cookie"), context);
  const userId = session.get("userId");
  if (!userId || typeof userId !== "string") {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`/signin?${searchParams}`);
  }
  return userId;
}

export async function createUserSession({
  request,
  context,
  userId,
  remember,
  redirectTo,
}: {
  request: Request;
  context?: SessionContext;
  userId: string;
  remember: boolean;
  redirectTo: string;
}) {
  const session = await getSession(request.headers.get("Cookie"), context);
  session.set("userId", userId);
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

  if (!adminUserId || typeof adminUserId !== "string") {
    const searchParams = new URLSearchParams([["redirectTo", redirectTo]]);
    throw redirect(`${ADMIN_LOGIN_PATH}?${searchParams}`);
  }

  const user = await findAdminUserById(db, adminUserId);

  if (!user || !user.active) {
    throw redirect(ADMIN_LOGIN_PATH);
  }

  return user;
}

export async function createAdminSession({
  request,
  context,
  userId,
  redirectTo,
}: {
  request: Request;
  context?: SessionContext;
  userId: string;
  redirectTo: string;
}) {
  const session = await getAdminSession(request.headers.get("Cookie"), context);
  session.set("adminUserId", userId);

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await commitAdminSession(session, {
        maxAge: 60 * 60 * 2,
      }, context),
    },
  });
}
