import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  local: vi.fn(), admin: vi.fn(), enabled: vi.fn(), supabaseSignIn: vi.fn(), session: vi.fn(), captcha: vi.fn(),
  issueAuthCsrfToken: vi.fn(), verifyAuthCsrfToken: vi.fn(),
}));
vi.mock("@edicut/db/repositories/users", () => ({ findUserByEmail: mocks.local }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserByEmail: mocks.admin }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({}) }));
vi.mock("../lib/session.server", () => ({
  createUserSession: mocks.session,
  isAdminRole: (role: string) => role === "admin",
  issueAuthCsrfToken: mocks.issueAuthCsrfToken,
  verifyAuthCsrfToken: mocks.verifyAuthCsrfToken,
}));
vi.mock("../lib/password.server", () => ({ verifyPassword: async () => true }));
vi.mock("../lib/recaptcha.server", () => ({ verifyRecaptchaToken: mocks.captcha }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: async () => "allowed", hashUsageLimitKey: async () => "identity-key", requestBodyExceedsLimit: () => false }));
vi.mock("../integrations/supabase/auth.server", () => ({ supabaseAuthEnabled: mocks.enabled, signInWithSupabase: mocks.supabaseSignIn, signUpWithSupabase: vi.fn() }));
import { action } from "./signin";
const local = { id: "local-id", email: "client@example.com", active: true, deletedAt: null, passwordHash: "test-only-hash" };
function request(headers?: HeadersInit, body: BodyInit = new URLSearchParams({ intent: "signin", email: local.email, password: "test-password" })) {
  return new Request("http://localhost:3002/signin", { method: "POST", headers, body });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.local.mockResolvedValue(local); mocks.admin.mockResolvedValue(null); mocks.enabled.mockReturnValue(false);
  mocks.captcha.mockResolvedValue({ success: true });
  mocks.issueAuthCsrfToken.mockResolvedValue({ token: "refreshed-token", setCookie: "_edicut_auth_csrf=refreshed" });
  mocks.verifyAuthCsrfToken.mockResolvedValue(true);
  mocks.supabaseSignIn.mockResolvedValue({ error: "Invalid credentials." }); mocks.session.mockResolvedValue(new Response(null, { status: 302 }));
});
describe("customer sign-in account restrictions", () => {
  it("allows local sign-in without an external CAPTCHA token while keeping rate limiting", async () => {
    await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);

    expect(mocks.captcha).not.toHaveBeenCalled();
    expect(mocks.local).toHaveBeenCalledWith({}, local.email);
    expect(mocks.session).toHaveBeenCalledOnce();
  });
  it("still requires CAPTCHA for public sign-in hosts", async () => {
    mocks.captcha.mockResolvedValue({ success: false, error: "Security check failed. Please try again." });
    const publicRequest = new Request("https://edicut.com/signin", {
      method: "POST",
      headers: { Origin: "https://edicut.com" },
      body: new URLSearchParams({ intent: "signin", email: local.email, password: "test-password" }),
    });

    const result = await action({ request: publicRequest, context: {}, params: {} } as Parameters<typeof action>[0]);

    expect(mocks.captcha).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ error: "Security check failed. Please try again." });
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it.each(["shortpass", "x".repeat(73), "বাংলা".repeat(8)])("rejects weak or truncated signup passwords before creating an account", async password => {
    const result = await action({ request: request(undefined, new URLSearchParams({ intent: "signup", email: local.email, password })), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error");
    expect(mocks.local).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("does not accept a stale local password after Supabase rejects it", async () => {
    mocks.enabled.mockReturnValue(true);
    const result = await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toMatchObject({ error: "Invalid credentials." });
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("normalizes a backslash open redirect before creating a local session", async () => {
    await action({ request: request(undefined, new URLSearchParams({ intent: "signin", email: local.email, password: "test-password", redirectTo: "/\\attacker.test" })), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(mocks.session).toHaveBeenCalledWith(expect.objectContaining({ redirectTo: "/dashboard" }));
  });
  it.each([false, true])("rejects disabled or trashed local accounts with Supabase enabled=%s", async enabled => {
    mocks.enabled.mockReturnValue(enabled);
    for (const record of [{ ...local, active: false }, { ...local, deletedAt: new Date() }]) {
      mocks.local.mockResolvedValue(record);
      const result = await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);
      expect(result).toHaveProperty("error"); expect(mocks.session).not.toHaveBeenCalled();
    }
  });
  it("uses the existing local profile ID returned by authenticated Supabase lookup", async () => {
    mocks.enabled.mockReturnValue(true);
    mocks.supabaseSignIn.mockResolvedValue({ user: { id: "auth-id", email: local.email }, session: { access_token: "test-token", refresh_token: "test-refresh" }, profileId: local.id });
    await action({ request: request(), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(mocks.session).toHaveBeenCalledWith(expect.objectContaining({ userId: local.id, accessToken: "test-token" }));
  });
  it("rejects an unverified login before looking up credentials", async () => {
    mocks.verifyAuthCsrfToken.mockResolvedValue(false);
    const result = await action({ request: request({ Origin: "http://localhost:3002" }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toMatchObject({ data: { error: "This sign-in form expired. Please try again." } });
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("rejects cross-site sign-in before reading credentials", async () => {
    const result = await action({ request: request({ Origin: "https://attacker.example" }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(403);
    expect(mocks.verifyAuthCsrfToken).not.toHaveBeenCalled();
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("rejects malformed login bodies without a parser exception", async () => {
    const result = await action({ request: request({ "Content-Type": "multipart/form-data; boundary=invalid" }, "malformed"), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error"); expect(mocks.session).not.toHaveBeenCalled();
  });
});
