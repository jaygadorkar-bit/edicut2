import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authUser: vi.fn(), refresh: vi.fn(), profile: vi.fn() }));
vi.mock("../integrations/supabase/client.server", () => ({ getSupabaseUserByAccessToken: mocks.authUser, refreshSupabaseSession: mocks.refresh }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.profile }));
vi.mock("./db.server", () => ({ getDbFromContext: () => ({}) }));
import { commitSession, createUserSession, getSession, requireUserId } from "./session.server";
const context = { cf: { env: { SESSION_SECRET: "profile-mapping-test-only" } } };
const user = { id: "auth-id", email: "client@example.com", email_confirmed_at: "2026-10-01" };
async function requestWithSession() {
  const session = await getSession(null, context);
  session.set("userId", "local-id"); session.set("supabaseAccessToken", "test-token"); session.set("supabaseRefreshToken", "test-refresh");
  const cookie = await commitSession(session, undefined, context);
  return new Request("http://localhost:3002/dashboard", { headers: { Cookie: cookie.split(";")[0] } });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.authUser.mockResolvedValue(user);
  mocks.profile.mockResolvedValue({ id: "local-id", email: user.email }); mocks.refresh.mockResolvedValue(null);
});
describe("authenticated local profile mapping", () => {
  it("returns the original local ID only when the authenticated email matches", async () => {
    expect(await requireUserId(await requestWithSession(), context)).toBe("local-id");
  });
  it.each([undefined, { id: "local-id", email: "other@example.com" }])("rejects missing or mismatched local profiles: %j", async profile => {
    mocks.profile.mockResolvedValue(profile);
    await expect(requireUserId(await requestWithSession(), context)).rejects.toMatchObject({ status: 302 });
  });
  it("does not trust an unconfirmed email for linking identities", async () => {
    mocks.authUser.mockResolvedValue({ ...user, email_confirmed_at: undefined });
    await expect(requireUserId(await requestWithSession(), context)).rejects.toMatchObject({ status: 302 });
  });
  it("preserves the local profile ID across token refresh", async () => {
    mocks.authUser.mockResolvedValue(null);
    mocks.refresh.mockResolvedValue({ user, session: { access_token: "next-access", refresh_token: "next-refresh" } });
    try { await requireUserId(await requestWithSession(), context); throw new Error("Expected redirect"); }
    catch (error) {
      expect(error).toBeInstanceOf(Response);
      const refreshed = await getSession((error as Response).headers.get("Set-Cookie"), context);
      expect(refreshed.get("userId")).toBe("local-id");
      expect(refreshed.get("supabaseAccessToken")).toBe("next-access");
    }
  });
  it("clears obsolete auth tokens when signing in through a local account", async () => {
    const response = await createUserSession({ request: await requestWithSession(), context, userId: "another-local-id", remember: false, redirectTo: "/dashboard" });
    const session = await getSession(response.headers.get("Set-Cookie"), context);
    expect(session.get("supabaseAccessToken")).toBeUndefined();
    expect(session.get("supabaseRefreshToken")).toBeUndefined();
    expect(session.get("userId")).toBe("another-local-id");
  });
});
