import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  local: vi.fn(), admin: vi.fn(), enabled: vi.fn(), supabaseSignIn: vi.fn(), session: vi.fn(),
}));
vi.mock("@edicut/db/repositories/users", () => ({ findUserByEmail: mocks.local }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserByEmail: mocks.admin }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({}) }));
vi.mock("../lib/session.server", () => ({ createUserSession: mocks.session, isAdminRole: (role: string) => role === "admin" }));
vi.mock("../lib/password.server", () => ({ verifyPassword: async () => true }));
vi.mock("../lib/recaptcha.server", () => ({ verifyRecaptchaToken: async () => ({ success: true }) }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: async () => "allowed", hashUsageLimitKey: async () => "identity-key", requestBodyExceedsLimit: () => false }));
vi.mock("../integrations/supabase/auth.server", () => ({ supabaseAuthEnabled: mocks.enabled, signInWithSupabase: mocks.supabaseSignIn, signUpWithSupabase: vi.fn() }));
import { action } from "./signin";
const local = { id: "local-id", email: "client@example.com", active: true, deletedAt: null, passwordHash: "test-only-hash" };
function request(headers?: HeadersInit, body: BodyInit = new URLSearchParams({ intent: "signin", email: local.email, password: "test-password" })) {
  return new Request("http://localhost:3002/signin", { method: "POST", headers, body });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.local.mockResolvedValue(local); mocks.admin.mockResolvedValue(null); mocks.enabled.mockReturnValue(false);
  mocks.supabaseSignIn.mockResolvedValue({ error: "Invalid credentials." }); mocks.session.mockResolvedValue(new Response(null, { status: 302 }));
});
describe("customer sign-in account restrictions", () => {
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
  it("rejects a cross-origin login before looking up credentials", async () => {
    const result = await action({ request: request({ Origin: "https://other.example" }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toMatchObject({ status: 403 }); expect(mocks.local).not.toHaveBeenCalled();
  });
  it("rejects malformed login bodies without a parser exception", async () => {
    const result = await action({ request: request({ "Content-Type": "multipart/form-data; boundary=invalid" }, "malformed"), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error"); expect(mocks.session).not.toHaveBeenCalled();
  });
});
