import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCookieSessionStorage } from "react-router";
const mocks = vi.hoisted(() => ({ user: vi.fn(), admin: vi.fn(), update: vi.fn(), revokeProvider: vi.fn() }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.user }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: mocks.admin, findAdminUserByEmail: mocks.admin }));
vi.mock("./db.server", () => ({ getDbFromContext: () => ({ update: mocks.update }) }));
vi.mock("../integrations/supabase/client.server", () => ({ getSupabaseUserByAccessToken: vi.fn(), refreshSupabaseSession: vi.fn(), revokeSupabaseSession: mocks.revokeProvider }));
import { commitAdminSession, commitSession, createAdminSession, createUserSession, getAdminSession, getSession, requireAdminUser, requireUserId, revokeAuthenticatedSessions } from "./session.server";
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
  mocks.revokeProvider.mockResolvedValue(undefined);
  mocks.update.mockImplementation(table => ({ set: (values: Record<string, unknown>) => ({ where: async () => {
    if (table === users) mocks.user.mockResolvedValue({ ...user, ...values });
    else mocks.admin.mockResolvedValue({ ...admin, ...values });
  } }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("authentication session security", () => {
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
