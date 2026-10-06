import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), update: vi.fn(), insert: vi.fn(), existing: vi.fn(), createSession: vi.fn(), set: vi.fn() }));
vi.mock("@edicut/shared/server-fetch", () => ({ fetchWithTimeout: mocks.fetch }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserByEmail: async () => null }));
vi.mock("./session.server", () => ({ createUserSession: mocks.createSession, isAdminRole: (role: string) => role === "admin", getAdminSession: vi.fn(), commitAdminSession: vi.fn() }));
import { completeGoogleOAuth, startGoogleOAuth } from "./google-auth.server";
const context = { env: {}, cf: { ctx: {} as ExecutionContext, env: { APP_URL: "http://localhost:3002", AUTH_GOOGLE_ID: "test-id", AUTH_GOOGLE_SECRET: "test-secret" } } };
const profile = { id: "local-id", email: "client@example.com", active: true, deletedAt: null };
const db = { query: { users: { findFirst: mocks.existing } }, update: mocks.update, insert: mocks.insert };
async function callback() {
  let started: Response;
  try { await startGoogleOAuth(new Request("http://localhost:3002/auth/google?returnTo=/dashboard"), context); throw new Error("Expected redirect"); }
  catch (error) { started = error as Response; }
  const state = new URL(started.headers.get("Location")!).searchParams.get("state");
  return new Request(`http://localhost:3002/api/auth/callback/google?code=test-code&state=${state}`, { headers: { Cookie: started.headers.get("Set-Cookie")!.split(";")[0] } });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.existing.mockResolvedValue(profile);
  mocks.fetch.mockResolvedValueOnce(Response.json({ access_token: "test-token" })).mockResolvedValueOnce(Response.json({ email: profile.email, email_verified: true, name: "Client" }));
  mocks.update.mockReturnValue({ set: mocks.set }); mocks.set.mockReturnValue({ where: () => ({ returning: async () => [profile] }) });
  mocks.createSession.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "/dashboard" } }));
});
describe("Google account restrictions", () => {
  it.each([{ ...profile, active: false }, { ...profile, deletedAt: new Date() }])("does not reactivate restricted profiles: %j", async existing => {
    mocks.existing.mockResolvedValue(existing);
    await expect(completeGoogleOAuth(await callback(), context, db as never)).rejects.toMatchObject({ status: 302 });
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it("preserves an active user's account restrictions and identity", async () => {
    await completeGoogleOAuth(await callback(), context, db as never);
    expect(mocks.set.mock.calls[0][0]).not.toHaveProperty("active");
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: profile.id }));
  });
  it("requires an explicit verified-email result", async () => {
    mocks.fetch.mockReset().mockResolvedValueOnce(Response.json({ access_token: "test-token" })).mockResolvedValueOnce(Response.json({ email: profile.email }));
    await expect(completeGoogleOAuth(await callback(), context, db as never)).rejects.toMatchObject({ status: 403 });
    expect(mocks.existing).not.toHaveBeenCalled();
  });
});
