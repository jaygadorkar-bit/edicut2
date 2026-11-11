import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCookieSessionStorage } from "react-router";
const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn(), update: vi.fn(), revokeProvider: vi.fn(), verifyProvider: vi.fn(), refreshProvider: vi.fn() }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.user }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: mocks.admin, findAdminUserByEmail: mocks.admin }));
vi.mock("./db.server", () => ({ getDbFromContext: () => ({ update: mocks.update }) }));
vi.mock("../integrations/supabase/client.server", () => ({ getSupabaseUserByAccessToken: mocks.verifyProvider, refreshSupabaseSession: mocks.refreshProvider, revokeSupabaseSession: mocks.revokeProvider }));
import { commitAdminSession, commitSession, createAdminSession, createUserSession, createSignOutCsrfToken, verifySignOutCsrfToken, getAdminSession, getSession, requireAdminUser, requireUserId, revokeAuthenticatedSessions } from "./session.server";
import type { DatabaseClient } from "@edicut/db/client";
import { users } from "@edicut/db/schema";

const secret = "session-security-tests-only-secret-32-chars";
const context = { cloudflare: { env: { SESSION_SECRET: secret } } };
const user = { id: "user-id", email: "user@example.test", passwordHash: "original-user-hash", active: true, deletedAt: null, sessionVersion: "11111111-1111-4111-8111-111111111111" };
const admin = { id: "admin-id", email: "admin@example.test", passwordHash: "original-admin-hash", active: true, role: "admin", sessionVersion: "22222222-2222-4222-8222-222222222222" };
const request = (cookie?: string) => new Request("https://edicut.com/dashboard", { headers: cookie ? { Cookie: cookie } : {} });
const cookie = (response: Response) => response.headers.get("Set-Cookie")!.split(";")[0];
const startUser = (remember = false) => createUserSession({ request: request(), context, userId: user.id, remember, redirectTo: "/dashboard" });
const startAdmin = () => createAdminSession({ request: request(), context, userId: admin.id, redirectTo: "/site/node-logmin" });
const beginning = new Date("2026-10-13T00:00:00Z").valueOf();
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(beginning); vi.clearAllMocks();
  mocks.user.mockResolvedValue(user); mocks.admin.mockResolvedValue(admin);
  mocks.verifyProvider.mockResolvedValue(null);
  mocks.refreshProvider.mockResolvedValue(null);
  mocks.revokeProvider.mockResolvedValue(undefined);
  mocks.update.mockImplementation(table => ({ set: (values: Record<string, unknown>) => ({ where: async () => {
    if (table === users) mocks.user.mockResolvedValue({ ...user, ...values });
    else mocks.admin.mockResolvedValue({ ...admin, ...values });
  } }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("authentication session security", () => {
  it("keeps sign-out CSRF tokens valid through provider cookie rotation but rejects a different login", async () => {
    const original = cookie(await startUser());
    const csrf = await createSignOutCsrfToken(original, context);
    const session = await getSession(original, context);
    session.set("supabaseAccessToken", "rotated-access");
    session.set("supabaseRefreshToken", "rotated-refresh");
    const rotated = (await commitSession(session, undefined, context)).split(";")[0];
    expect(await verifySignOutCsrfToken(csrf, rotated, context)).toBe(true);
    vi.setSystemTime(beginning + 1000);
    expect(await verifySignOutCsrfToken(csrf, cookie(await startUser()), context)).toBe(false);
  });
  it.each(["GET", "POST", "PATCH"])("restores a missing admin cookie from a freshly verified workspace login for %s", async method => {
    const matchingAdmin = { ...admin, email: user.email };
    mocks.admin.mockResolvedValue(matchingAdmin);
    const userCookie = cookie(await createUserSession({ request: request(), context, userId: user.id, remember: true,
      redirectTo: "/dashboard", adminUserId: admin.id, adminAccessVerified: true }));
    const resource = new Request("https://edicut.com/api/notifications?scope=admin", { method, headers: { Cookie: userCookie } });
    const response = await requireAdminUser(resource, {} as DatabaseClient, context).catch(error => error as Response);
    expect(response.status).toBe(method === "GET" ? 302 : 307);
    expect(response.headers.get("Location")).toBe(resource.url);
    const adminCookie = cookie(response);
    expect((await getAdminSession(adminCookie, context)).get("adminUserId")).toBe(admin.id);
    expect(await requireAdminUser(new Request(resource.url, { headers: { Cookie: `${userCookie}; ${adminCookie}` } }), {} as DatabaseClient, context)).toEqual(matchingAdmin);
  });
  it.each(["unverified", "revoked", "email-mismatch", "inactive"])("does not restore admin access from a %s workspace grant", async condition => {
    const matchingAdmin = { ...admin, email: user.email };
    mocks.admin.mockResolvedValue(matchingAdmin);
    const userCookie = cookie(await createUserSession({ request: request(), context, userId: user.id, remember: true,
      redirectTo: "/dashboard", adminUserId: admin.id, adminAccessVerified: condition !== "unverified" }));
    if (condition === "revoked") mocks.admin.mockResolvedValue({ ...matchingAdmin, sessionVersion: crypto.randomUUID() });
    if (condition === "email-mismatch") mocks.admin.mockResolvedValue(admin);
    if (condition === "inactive") mocks.user.mockResolvedValue({ ...user, active: false });
    const response = await requireAdminUser(request(userCookie), {} as DatabaseClient, context).catch(error => error as Response);
    expect(response.headers.get("Location")).toContain("/signin");
    expect((await getAdminSession(response.headers.get("Set-Cookie"), context)).get("adminUserId")).toBeUndefined();
  });
  it("preserves form submissions when refreshing an expired provider token", async () => {
    const userCookie = cookie(await createUserSession({ request: request(), context, userId: user.id, remember: false,
      redirectTo: "/dashboard", accessToken: "expired-form-access", refreshToken: "form-refresh" }));
    mocks.refreshProvider.mockResolvedValue({ user: { id: user.id }, session: { access_token: "new-form-access", refresh_token: "new-form-refresh" } });
    const response = await requireUserId(new Request("https://edicut.com/dashboard/profile", { method: "POST", headers: { Cookie: userCookie } }), context).catch(error => error as Response);
    expect(response.status).toBe(307);
    expect(response.headers.get("Set-Cookie")).toContain("_session=");
  });
  it("revokes copied local/Google session cookies on logout and rejects replayed revocations", async () => {
    const copiedCookie = cookie(await startUser());
    const session = await getSession(copiedCookie, context), emptyAdmin = await getAdminSession(null, context);
    await revokeAuthenticatedSessions(session, emptyAdmin, context);
    await expect(requireUserId(request(copiedCookie), context)).rejects.toMatchObject({ status: 302 });
    const newCookie = cookie(await startUser());
    await revokeAuthenticatedSessions(session, emptyAdmin, context);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(await requireUserId(request(newCookie), context)).toBe(user.id);
  });
  it("revokes copied admin cookies without changing the account's password", async () => {
    const copiedCookie = cookie(await startAdmin());
    await revokeAuthenticatedSessions(await getSession(null, context), await getAdminSession(copiedCookie, context), context);
    await expect(requireAdminUser(request(copiedCookie), {} as DatabaseClient, context)).rejects.toMatchObject({ status: 302 });
  });
  it("does not claim logout success if the revocation store is unavailable", async () => {
    const session = await getSession(cookie(await startUser()), context);
    mocks.update.mockImplementation(() => { throw new Error("database unavailable"); });
    await expect(revokeAuthenticatedSessions(session, await getAdminSession(null, context), context)).rejects.toThrow("database unavailable");
  });
  it("expires customer sessions on the server even when the browser sends the old cookie", async () => {
    const oldCookie = cookie(await startUser());
    expect(await requireUserId(request(oldCookie), context)).toBe(user.id);
    vi.setSystemTime(beginning + 12 * 60 * 60 * 1000 + 1);
    expect((await getSession(oldCookie, context)).get("userId")).toBeUndefined();
    await expect(requireUserId(request(oldCookie), context)).rejects.toMatchObject({ status: 302 });
  });
  it("caps remembered sessions at seven days", async () => {
    const oldCookie = cookie(await startUser(true));
    vi.setSystemTime(beginning + 24 * 60 * 60 * 1000);
    expect(await requireUserId(request(oldCookie), context)).toBe(user.id);
    vi.setSystemTime(beginning + 7 * 24 * 60 * 60 * 1000 + 1);
    expect((await getSession(oldCookie, context)).get("userId")).toBeUndefined();
  });
  it("does not extend an admin's absolute two-hour deadline on ordinary page reads", async () => {
    const oldCookie = cookie(await startAdmin());
    vi.setSystemTime(beginning + 60 * 60 * 1000);
    const session = await getAdminSession(oldCookie, context);
    const renewed = await commitAdminSession(session, { maxAge: 7200 }, context);
    expect(renewed).toContain("Max-Age=3600");
    vi.setSystemTime(beginning + 2 * 60 * 60 * 1000 + 1);
    expect((await getAdminSession(renewed, context)).get("adminUserId")).toBeUndefined();
  });
  it("rejects older signed cookies that never had a server deadline", async () => {
    const storage = createCookieSessionStorage({ cookie: { name: "_session", secrets: [secret] } });
    const legacy = await storage.getSession(); legacy.set("userId", user.id);
    expect((await getSession(await storage.commitSession(legacy), context)).get("userId")).toBeUndefined();
  });
  it("rejects a tampered signed cookie", async () => {
    const original = cookie(await startUser());
    const tampered = original.slice(0, -2) + "zz";
    expect((await getSession(tampered, context)).get("userId")).toBeUndefined();
  });
  it.each(["passwordHash", "email"] as const)("invalidates old customer cookies after a %s change", async field => {
    const oldCookie = cookie(await startUser());
    mocks.user.mockResolvedValue({ ...user, [field]: "changed" });
    await expect(requireUserId(request(oldCookie), context)).rejects.toMatchObject({ status: 302 });
  });
  it("invalidates old admin cookies after a password change", async () => {
    const oldCookie = cookie(await startAdmin());
    mocks.admin.mockResolvedValue({ ...admin, passwordHash: "new-admin-hash" });
    await expect(requireAdminUser(request(oldCookie), {} as DatabaseClient, context)).rejects.toMatchObject({ status: 302 });
  });
  it("sends expired admin sessions to the main sign-in page and preserves the requested admin route", async () => {
    const oldCookie = cookie(await startAdmin());
    const target = "/site/node-logmin/recruiting-forms?tab=pending";
    const adminRequest = new Request(`https://edicut.com${target}`, { headers: { Cookie: oldCookie } });
    mocks.admin.mockResolvedValue({ ...admin, sessionVersion: "33333333-3333-4333-8333-333333333333" });

    const response = await requireAdminUser(adminRequest, {} as DatabaseClient, context).catch(error => error);
    expect(response).toBeInstanceOf(Response);
    const redirectUrl = new URL((response as Response).headers.get("Location")!, adminRequest.url);
    expect(redirectUrl.pathname).toBe("/signin");
    expect(redirectUrl.searchParams.get("mode")).toBe("signin");
    expect(redirectUrl.searchParams.get("error")).toBe("session-expired");
    const accessUrl = new URL(redirectUrl.searchParams.get("redirectTo")!, adminRequest.url);
    expect(accessUrl.pathname).toBe("/site/node-logmin/access");
    expect(new URLSearchParams(accessUrl.search).get("returnTo")).toBe(target);
    expect((response as Response).headers.get("Set-Cookie")).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
  });
  it("coalesces concurrent Supabase refreshes for the same expired customer cookie", async () => {
    const oldCookie = cookie(await createUserSession({
      request: request(), context, userId: user.id, remember: false, redirectTo: "/dashboard",
      accessToken: "expired-access-token", refreshToken: "shared-refresh-token",
    }));
    const refreshed = {
      user: { id: user.id },
      session: { access_token: "new-access-token", refresh_token: "new-refresh-token" },
    };
    let releaseRefresh!: (value: typeof refreshed) => void;
    let markRefreshStarted!: () => void;
    const refreshStarted = new Promise<void>(resolve => { markRefreshStarted = resolve; });
    const refreshGate = new Promise<typeof refreshed>(resolve => { releaseRefresh = resolve; });
    mocks.verifyProvider.mockImplementation(async () => {
      await Promise.resolve();
      return null;
    });
    mocks.refreshProvider.mockImplementation(() => {
      markRefreshStarted();
      return refreshGate;
    });

    const first = requireUserId(request(oldCookie), context);
    const second = requireUserId(request(oldCookie), context);
    await refreshStarted;
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.refreshProvider).toHaveBeenCalledTimes(1);

    releaseRefresh(refreshed);
    const results = await Promise.allSettled([first, second]);
    const redirects = results.map(result => result.status === "rejected" ? result.reason as Response : null);
    expect(redirects.every(response => response?.status === 302)).toBe(true);
    const refreshedSession = await getSession(cookie(redirects[0]!), context);
    expect(refreshedSession.get("supabaseAccessToken")).toBe("new-access-token");
    expect(refreshedSession.get("supabaseRefreshToken")).toBe("new-refresh-token");
  });
  it("sets Secure and HttpOnly in Workers without NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "");
    const response = await startAdmin();
    expect(response.headers.get("Set-Cookie")).toContain("Secure");
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=Strict");
  });
  it("refuses a deployed Worker without a configured session secret", async () => {
    vi.stubEnv("NODE_ENV", ""); vi.stubEnv("SESSION_SECRET", "");
    await expect(getSession(null, { cloudflare: { env: {} } })).rejects.toThrow("SESSION_SECRET is required");
  });
  it("refuses the known development secret in a deployed Worker", async () => {
    await expect(getSession(null, { cloudflare: { env: { SESSION_SECRET: "local-dev-session-secret-change-in-production" } } })).rejects.toThrow("SESSION_SECRET is required");
  });
  it("does not expose password hashes in the readable cookie payload", async () => {
    const session = await getSession(cookie(await startUser()), context);
    expect(JSON.stringify(session.data)).not.toContain(user.passwordHash);
    expect(session.get("authCredentialVersion")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("does not renew a customer deadline during a cookie commit", async () => {
    const oldCookie = cookie(await startUser(true));
    vi.setSystemTime(beginning + 24 * 60 * 60 * 1000);
    const session = await getSession(oldCookie, context);
    const next = await commitSession(session, { maxAge: 7 * 24 * 60 * 60 }, context);
    expect((await getSession(next, context)).get("authExpiresAt")).toBe(beginning + 7 * 24 * 60 * 60 * 1000);
  });
});
