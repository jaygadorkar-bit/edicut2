import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUserById: vi.fn(),
  listUsers: vi.fn(),
  updateUserById: vi.fn(),
  deleteUser: vi.fn(),
  setSession: vi.fn(), signOut: vi.fn(), adminSignOut: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { deleteSupabaseUsersByEmail, revokeSupabaseSession, updateSupabaseUserEmailByEmail, updateSupabaseUserPasswordByEmail } from "./client.server";

let keySequence = 0;
function context() {
  keySequence += 1;
  return { cloudflare: { env: {
    SUPABASE_URL: "https://auth.example.test",
    SUPABASE_PUBLISHABLE_KEY: "publishable-test-key",
    SUPABASE_SERVICE_ROLE_KEY: `service-test-key-${keySequence}`,
  } } };
}

const authUser = { id: "auth-user-id", email: "client@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockImplementation(() => ({ auth: { setSession: mocks.setSession, signOut: mocks.signOut, admin: {
    getUserById: mocks.getUserById,
    listUsers: mocks.listUsers,
    updateUserById: mocks.updateUserById,
    deleteUser: mocks.deleteUser,
    signOut: mocks.adminSignOut,
  } } }));
  mocks.getUserById.mockResolvedValue({ data: { user: null }, error: { message: "not found" } });
  mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null });
  mocks.updateUserById.mockResolvedValue({ error: null });
  mocks.deleteUser.mockResolvedValue({ error: null });
  mocks.setSession.mockResolvedValue({ error: null }); mocks.signOut.mockResolvedValue({ error: null }); mocks.adminSignOut.mockResolvedValue({ error: null });
});

describe("server-side Supabase Auth account updates", () => {
  it("revokes the current provider session after refreshing expired access credentials", async () => {
    await revokeSupabaseSession(context(), "access-token", "refresh-token");
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "access-token", refresh_token: "refresh-token" });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("does not claim successful logout during a provider outage", async () => {
    mocks.setSession.mockResolvedValue({ error: { status: 503 } });
    await expect(revokeSupabaseSession(context(), "access-token", "refresh-token")).rejects.toThrow("revocation is unavailable");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("allows already-invalid provider sessions to be cleared", async () => {
    mocks.setSession.mockResolvedValue({ error: { status: 400, code: "refresh_token_not_found" } });
    await expect(revokeSupabaseSession(context(), "access-token", "refresh-token")).resolves.toBeUndefined();
  });
  it("does not mistake a misconfigured provider key for an already-revoked session", async () => {
    mocks.setSession.mockResolvedValue({ error: { status: 401, code: "invalid_api_key" } });
    await expect(revokeSupabaseSession(context(), "access-token", "refresh-token")).rejects.toThrow("revocation is unavailable");
  });
  it("keeps local-only logouts independent of Supabase", async () => {
    await revokeSupabaseSession(undefined, undefined, undefined);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("updates a password using a matching auth ID without scanning the user directory", async () => {
    mocks.getUserById.mockResolvedValue({ data: { user: authUser }, error: null });
    await expect(updateSupabaseUserPasswordByEmail(context(), authUser.email, "NewPassword123!", authUser.id)).resolves.toBe(true);
    expect(mocks.listUsers).not.toHaveBeenCalled();
    expect(mocks.updateUserById).toHaveBeenCalledWith(authUser.id, { password: "NewPassword123!" });
  });

  it("uses bounded pages when a legacy profile ID differs from the Auth ID", async () => {
    const fillers = Array.from({ length: 1000 }, (_, index) => ({ id: `filler-${index}`, email: `filler-${index}@example.test` }));
    mocks.listUsers
      .mockResolvedValueOnce({ data: { users: fillers }, error: null })
      .mockResolvedValueOnce({ data: { users: [authUser] }, error: null });
    await expect(updateSupabaseUserPasswordByEmail(context(), authUser.email, "NewPassword123!", "legacy-profile-id")).resolves.toBe(true);
    expect(mocks.listUsers).toHaveBeenNthCalledWith(1, { page: 1, perPage: 1000 });
    expect(mocks.listUsers).toHaveBeenNthCalledWith(2, { page: 2, perPage: 1000 });
    expect(mocks.updateUserById).toHaveBeenCalledWith(authUser.id, { password: "NewPassword123!" });
  });

  it("keeps an admin-managed email correction aligned with Auth", async () => {
    mocks.listUsers.mockResolvedValue({ data: { users: [authUser] }, error: null });
    await expect(updateSupabaseUserEmailByEmail(context(), authUser.email, "new@example.com")).resolves.toBe(true);
    expect(mocks.updateUserById).toHaveBeenCalledWith(authUser.id, { email: "new@example.com", email_confirm: true });
  });

  it("leaves legacy local-only accounts on the local password path when Auth is disabled", async () => {
    await expect(updateSupabaseUserPasswordByEmail({ cloudflare: { env: { SUPABASE_AUTH_ENABLED: "false" } } }, authUser.email, "NewPassword123!")).resolves.toBe(false);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("does not report success when Supabase rejects the credential update", async () => {
    mocks.getUserById.mockResolvedValue({ data: { user: authUser }, error: null });
    mocks.updateUserById.mockResolvedValue({ error: new Error("provider unavailable") });
    await expect(updateSupabaseUserPasswordByEmail(context(), authUser.email, "NewPassword123!", authUser.id)).rejects.toThrow("provider unavailable");
  });

  it("deletes only matching Supabase identities for permanently removed local accounts", async () => {
    const otherUser = { id: "other-auth-id", email: "other@example.com" };
    mocks.listUsers.mockResolvedValue({ data: { users: [authUser, otherUser] }, error: null });
    await expect(deleteSupabaseUsersByEmail(context(), [" CLIENT@example.com "])).resolves.toBe(1);
    expect(mocks.deleteUser).toHaveBeenCalledTimes(1);
    expect(mocks.deleteUser).toHaveBeenCalledWith(authUser.id);
  });

  it("keeps local-only account deletion independent of Supabase", async () => {
    await expect(deleteSupabaseUsersByEmail({ cloudflare: { env: { SUPABASE_AUTH_ENABLED: "false" } } }, [authUser.email])).resolves.toBe(0);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
