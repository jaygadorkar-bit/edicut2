import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), enabled: vi.fn(), provider: vi.fn(), password: vi.fn(), session: vi.fn() }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserByEmail: mocks.lookup }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({}) }));
vi.mock("../lib/session.server", () => ({ createAdminSession: mocks.session, isAdminRole: (role: string) => role === "admin" }));
vi.mock("../lib/password.server", () => ({ verifyPassword: mocks.password }));
vi.mock("../lib/recaptcha.server", () => ({ verifyRecaptchaToken: async () => ({ success: true }) }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: async () => "allowed", hashUsageLimitKey: async () => "test-key", requestBodyExceedsLimit: () => false }));
vi.mock("../integrations/supabase/auth.server", () => ({ signInWithSupabase: mocks.provider, supabaseAuthEnabled: mocks.enabled }));
import { action } from "./admin-login";
const admin = { id: "admin-id", email: "admin@example.test", active: true, role: "admin", passwordHash: "old-local-hash" };
const run = () => action({ request: new Request("https://edicut.com/site/node-logmin/login", { method: "POST", headers: { Origin: "https://edicut.com" }, body: new URLSearchParams({ email: admin.email, password: "previous-password" }) }), params: {}, context: {} } as Parameters<typeof action>[0]);
beforeEach(() => {
  vi.clearAllMocks(); globalThis.__edicutAdminLoginAttempts = new Map();
  mocks.lookup.mockResolvedValue(admin); mocks.enabled.mockReturnValue(true); mocks.password.mockResolvedValue(true);
  mocks.provider.mockResolvedValue({ error: "Invalid credentials." });
  mocks.session.mockResolvedValue(new Response(null, { status: 302 }));
});
describe("admin provider authentication", () => {
  it("cannot bypass a provider rejection using an old admin password", async () => {
    expect(await run()).toHaveProperty("error");
    expect(mocks.password).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([{ email: admin.email }, { email: "other@example.test", email_confirmed_at: "confirmed" }])("rejects an unconfirmed or mismatched provider identity: %j", async user => {
    mocks.provider.mockResolvedValue({ user, session: { access_token: "access", refresh_token: "refresh" } });
    expect(await run()).toHaveProperty("error"); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("keeps explicit local authentication available when Supabase Auth is disabled", async () => {
    mocks.enabled.mockReturnValue(false);
    await run();
    expect(mocks.provider).not.toHaveBeenCalled(); expect(mocks.password).toHaveBeenCalled(); expect(mocks.session).toHaveBeenCalledOnce();
  });
});
