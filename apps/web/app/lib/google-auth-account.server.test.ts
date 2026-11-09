import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), insert: vi.fn(), existing: vi.fn(), lock: vi.fn(), createSession: vi.fn(), set: vi.fn(), findAdmin: vi.fn(), adminSessionSet: vi.fn(), commitAdmin: vi.fn() }));
vi.mock("@edicut/shared/server-fetch", () => ({ fetchWithTimeout: mocks.fetch }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserByEmail: mocks.findAdmin }));
vi.mock("./session.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("./session.server")>(),
  createUserSession: mocks.createSession, isAdminRole: (role: string) => role === "admin", getAdminSession: async () => ({ set: mocks.adminSessionSet }), commitAdminSession: mocks.commitAdmin,
}));
import { completeGoogleOAuth, createGoogleOAuthFailureResponse, googleSignInPath, startGoogleOAuth } from "./google-auth.server";
import { createCookie } from "react-router";
const context = { env: {}, cf: { ctx: {} as ExecutionContext, env: { NODE_ENV: "development", SESSION_SECRET: "fixture-session-secret", APP_URL: "http://localhost:3002", AUTH_GOOGLE_ID: "test-id", AUTH_GOOGLE_SECRET: "test-secret" } } };
const profile = { id: "local-id", email: "client@gmail.com", active: true, deletedAt: null };
const db = { query: { users: { findMany: mocks.existing } }, update: mocks.update, insert: mocks.insert, execute: mocks.lock };
const getDb = vi.fn(() => ({ ...db, transaction: (run: (tx: typeof db) => Promise<unknown>) => run(db) }) as never);
async function callback(mode = "user") {
  const form = new FormData();
  form.set("mode", mode);
  form.set("returnTo", "/dashboard");
  const started = await startGoogleOAuth(new Request("http://localhost:3002/auth/google", { method: "POST" }), context, form);
  const googleUrl = new URL(started.headers.get("Location")!);
  expect(started.status).toBe(303);
  expect(googleUrl.searchParams.get("code_challenge_method")).toBe("S256");
  expect(googleUrl.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
  const state = googleUrl.searchParams.get("state");
  return new Request(`http://localhost:3002/api/auth/callback/google?code=test-code&state=${state}`, { headers: { Cookie: started.headers.get("Set-Cookie")!.split(";")[0] } });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.fetch.mockReset(); mocks.existing.mockReset().mockResolvedValue([profile]);
  mocks.findAdmin.mockResolvedValue(null); mocks.commitAdmin.mockResolvedValue("_edicut_admin=test-admin-session");
  mocks.fetch.mockResolvedValueOnce(Response.json({ access_token: "test-token" })).mockResolvedValueOnce(Response.json({ email: profile.email, email_verified: true, name: "Client" }));
  mocks.update.mockReturnValue({ set: mocks.set }); mocks.set.mockReturnValue({ where: () => ({ returning: async () => [profile] }) });
  mocks.createSession.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "/dashboard", "Set-Cookie": "_session=fixture-session; Path=/; HttpOnly" } }));
});
describe("Google account restrictions", () => {
  it.each(["/%73ignin", "/api/%61uth/callback/google", `/dashboard?q=${"é".repeat(250)}`])("rejects callback loops and oversized encoded return paths: %s", returnTo => {
    expect(googleSignInPath("user", returnTo)).toBe("/signin?redirectTo=%2Fdashboard");
  });
  it.each(["user", "admin"])("clears failed %s OAuth attempts and returns to the correct login", async mode => {
    const response = await createGoogleOAuthFailureResponse(await callback(mode), context);
    const destination = new URL(response.headers.get("Location")!, "http://localhost:3002");
    expect(destination.pathname).toBe(mode === "admin" ? "/site/node-logmin/login" : "/signin");
    expect(destination.searchParams.get("error")).toBe("google-unavailable");
    expect(destination.searchParams.has("code")).toBe(false);
    expect(destination.searchParams.has("state")).toBe(false);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });
  it("ignores unsigned transaction cookies", async () => {
    const cookie = await createCookie("_edicut_google_oauth").serialize({ mode: "user", returnTo: "/\\attacker.test" });
    const response = await completeGoogleOAuth(new Request("http://localhost:3002/api/auth/callback/google?code=test-code&state=forged", { headers: { Cookie: cookie } }), context, getDb);
    expect(response.headers.get("Location")).toBe("/signin?error=google-state");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });
  it.each([{ ...profile, active: false }, { ...profile, deletedAt: new Date() }])("does not reactivate restricted profiles: %j", async existing => {
    mocks.existing.mockResolvedValue([existing]);
    expect((await completeGoogleOAuth(await callback(), context, getDb)).headers.get("Location")).toContain("error=account-unavailable");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it("preserves an active user's account restrictions and identity", async () => {
    const response = await completeGoogleOAuth(await callback(), context, getDb);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3002/dashboard");
    expect(response.headers.getSetCookie()).toEqual([expect.stringContaining("_session=fixture-session"), expect.stringContaining("Max-Age=0")]);
    expect(mocks.fetch.mock.calls[0][1].body.get("code_verifier")).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.fetch.mock.calls[0][1].redirect).toBe("manual");
    expect(mocks.fetch.mock.calls[1][1].redirect).toBe("manual");
    expect(mocks.set.mock.calls[0][0]).not.toHaveProperty("active");
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: profile.id }));
  });
  it("refuses to choose an identity when an email matches multiple profiles", async () => {
    mocks.existing.mockResolvedValue([profile, { ...profile, id: "another-user" }]);
    const response = await completeGoogleOAuth(await callback(), context, getDb);
    expect(response.headers.get("Location")).toContain("error=account-unavailable");
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("signs in a complete profile without writing to it", async () => {
    mocks.existing.mockResolvedValue([{ ...profile, name: "Existing name" }]);
    expect((await completeGoogleOAuth(await callback(), context, getDb)).status).toBe(303);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("reuses a profile created by a concurrent Google callback", async () => {
    mocks.existing.mockResolvedValueOnce([]).mockResolvedValueOnce([{ ...profile, name: "Existing name" }]);
    const response = await completeGoogleOAuth(await callback(), context, getDb);
    expect(response.status).toBe(303);
    expect(mocks.lock).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("creates a customer profile after the locked lookup finds no account", async () => {
    mocks.existing.mockResolvedValue([]);
    const values = vi.fn(() => ({ returning: async () => [{ ...profile, name: "Client" }] }));
    mocks.insert.mockReturnValue({ values });
    expect((await completeGoogleOAuth(await callback(), context, getDb)).status).toBe(303);
    expect(values).toHaveBeenCalledWith({ email: profile.email, name: "Client", profileImageUrl: null, role: "customer" });
    expect(mocks.existing).toHaveBeenCalledTimes(2);
  });
  it("requires an explicit verified-email result", async () => {
    mocks.fetch.mockReset().mockResolvedValueOnce(Response.json({ access_token: "test-token" })).mockResolvedValueOnce(Response.json({ email: profile.email }));
    expect((await completeGoogleOAuth(await callback(), context, getDb)).headers.get("Location")).toContain("error=google-email");
    expect(mocks.existing).not.toHaveBeenCalled();
  });
  it("returns to sign-in on the configured loopback host instead of replaying the POST", async () => {
    const response = await startGoogleOAuth(new Request("http://127.0.0.1:3002/auth/google", { method: "POST" }), context, new FormData());
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3002/signin?redirectTo=%2Fdashboard");
    expect(response.headers.has("Set-Cookie")).toBe(false);
  });
  it("recovers from cancellation and leaves a newer transaction alone on a mismatched state", async () => {
    const request = await callback();
    const url = new URL(request.url);
    url.searchParams.delete("code");
    url.searchParams.set("error", "access_denied");
    const cancelled = await completeGoogleOAuth(new Request(url, { headers: request.headers }), context, getDb);
    expect(cancelled.headers.get("Location")).toContain("error=google-cancelled");
    expect(cancelled.headers.get("Set-Cookie")).toContain("Max-Age=0");
    url.searchParams.set("state", "older-attempt");
    const mismatch = await completeGoogleOAuth(new Request(url, { headers: request.headers }), context, getDb);
    expect(mismatch.headers.get("Location")).toContain("error=google-state");
    expect(mismatch.headers.has("Set-Cookie")).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("expires a valid signed transaction on the server", async () => {
    const request = await callback();
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 601_000);
    try {
      const response = await completeGoogleOAuth(request, context, getDb);
      expect(response.headers.get("Location")).toContain("error=google-state");
      expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
      expect(mocks.fetch).not.toHaveBeenCalled();
    } finally {
      now.mockRestore();
    }
  });
  it("preserves the verified Google photo for admin-only accounts without creating a client profile", async () => {
    mocks.findAdmin.mockResolvedValue({ id: "admin-id", active: true, role: "admin" });
    mocks.fetch.mockReset().mockResolvedValueOnce(Response.json({ access_token: "test-token" })).mockResolvedValueOnce(Response.json({ email: profile.email, email_verified: true, picture: "https://lh3.googleusercontent.com/test-avatar" }));
    await completeGoogleOAuth(await callback("admin"), context, getDb);
    expect(mocks.adminSessionSet).toHaveBeenCalledWith("profileEmail", profile.email);
    expect(mocks.adminSessionSet).toHaveBeenCalledWith("profileImageUrl", "https://lh3.googleusercontent.com/test-avatar");
    expect(mocks.existing).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
