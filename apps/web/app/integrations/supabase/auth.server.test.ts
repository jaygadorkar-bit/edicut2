import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  signUp: vi.fn(), signIn: vi.fn(), byId: vi.fn(), byEmail: vi.fn(), insert: vi.fn(), values: vi.fn(),
}));
vi.mock("./client.server", () => ({
  getSupabaseClient: () => ({ auth: { signUp: mocks.signUp, signInWithPassword: mocks.signIn } }),
  isSupabaseConfigured: () => true,
}));
vi.mock("../../lib/db.server", () => ({ getDbFromContext: () => ({ insert: mocks.insert }) }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.byId, findUserByEmail: mocks.byEmail }));
import { signInWithSupabase, signUpWithSupabase } from "./auth.server";
const authUser = { id: "auth-id", email: "client@example.com", email_confirmed_at: "2026-10-01", user_metadata: { name: "Client", role: "admin" } };
const session = { access_token: "test-access", refresh_token: "test-refresh" };
const input = { email: authUser.email, password: "test-password" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.byId.mockResolvedValue(undefined);
  mocks.byEmail.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({ values: mocks.values });
  mocks.values.mockResolvedValue(undefined);
  mocks.signUp.mockResolvedValue({ data: { user: authUser, session }, error: null });
  mocks.signIn.mockResolvedValue({ data: { user: authUser, session }, error: null });
});
describe("application profile synchronization", () => {
  it("creates the profile in the application's database with a customer role", async () => {
    const result = await signInWithSupabase(input);
    expect(result.profileId).toBe(authUser.id);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ id: authUser.id, email: authUser.email, role: "customer" }));
  });
  it("preserves the local profile ID and does not overwrite roles or ownership", async () => {
    mocks.byEmail.mockResolvedValue({ id: "existing-local-id", email: authUser.email, role: "editor", active: true });
    expect((await signInWithSupabase(input)).profileId).toBe("existing-local-id");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each([{ active: false }, { active: true, deletedAt: new Date() }])("rejects restricted accounts: %j", async status => {
    mocks.byId.mockResolvedValue({ id: authUser.id, email: authUser.email, ...status });
    expect(await signInWithSupabase(input)).toEqual({ user: null, session: null, error: "This account is unavailable. Contact EdiCut support." });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("requires confirmed email to link an existing account", async () => {
    mocks.byEmail.mockResolvedValue({ id: "local-id", email: authUser.email, active: true });
    mocks.signIn.mockResolvedValue({ data: { user: { ...authUser, email_confirmed_at: undefined }, session }, error: null });
    expect((await signInWithSupabase(input)).session).toBeNull();
  });
  it("does not create a profile or expose account existence while sign-up awaits confirmation", async () => {
    mocks.signUp.mockResolvedValue({ data: { user: authUser, session: null }, error: null });
    expect((await signUpWithSupabase(input)).profileId).toBeUndefined();
    expect(mocks.byId).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("hides database error details and issues no session when profile sync fails", async () => {
    mocks.byId.mockRejectedValue(new Error("database secret detail"));
    const result = await signInWithSupabase(input);
    expect(result.user).toBeNull();
    expect(result.error).not.toContain("secret");
  });
});
