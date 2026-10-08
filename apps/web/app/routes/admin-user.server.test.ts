import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  consumeUsageLimit: vi.fn(),
  db: { query: { users: { findFirst: vi.fn() }, adminUsers: { findFirst: vi.fn() } }, update: vi.fn(), delete: vi.fn() },
  resetCreatorProfile: vi.fn(),
  deleteSupabaseUsersByEmail: vi.fn(),
  updateSupabaseUserEmailByEmail: vi.fn(),
  updateSupabaseUserPasswordByEmail: vi.fn(),
}));

vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("../lib/session.server", () => ({
  isAdminRole: (role: string) => role === "admin",
  requireAdminUser: mocks.admin,
}));
vi.mock("../lib/client-workspace.server", () => ({ resetCreatorProfile: mocks.resetCreatorProfile }));
vi.mock("../integrations/supabase/client.server", () => ({
  deleteSupabaseUsersByEmail: mocks.deleteSupabaseUsersByEmail,
  updateSupabaseUserEmailByEmail: mocks.updateSupabaseUserEmailByEmail,
  updateSupabaseUserPasswordByEmail: mocks.updateSupabaseUserPasswordByEmail,
}));
vi.mock("../lib/usage-protection.server", () => ({
  consumeUsageLimit: mocks.consumeUsageLimit,
  requestBodyExceedsLimit: () => false,
}));

import { action } from "./admin-user";

const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const admin = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "admin", active: true };

function actionArgs({ origin = "https://edicut.test" } = {}) {
  const request = new Request(`https://edicut.test/site/node-logmin/users/${userId}`, {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({ intent: "reset-creator-profile" }),
  });
  return {
    request,
    url: new URL(request.url),
    pattern: "/site/node-logmin/users/:userId",
    context: {},
    params: { userId },
  } as Parameters<typeof action>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockImplementation(async () => ({ ...admin }));
  mocks.consumeUsageLimit.mockResolvedValue("allowed");
  mocks.resetCreatorProfile.mockResolvedValue(true);
  mocks.updateSupabaseUserEmailByEmail.mockResolvedValue(false);
  mocks.updateSupabaseUserPasswordByEmail.mockResolvedValue(false);
  mocks.db.query.users.findFirst.mockResolvedValue({ email: "client@example.com" });
  mocks.db.query.adminUsers.findFirst.mockResolvedValue(null);
  mocks.db.update.mockReturnValue({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) });
  mocks.deleteSupabaseUsersByEmail.mockResolvedValue(0);
});

describe("admin creator profile reset action", () => {
  it("allows an administrator to reset only the selected user's profile", async () => {
    const args = actionArgs();
    await expect(action(args)).resolves.toEqual({
      success: "Creator profile reset. The user can set it up again.",
    });
    expect(mocks.resetCreatorProfile).toHaveBeenCalledWith(mocks.db, userId);
  });

  it("rejects non-admin roles before changing profile data", async () => {
    mocks.admin.mockResolvedValue({ ...admin, role: "support" });
    await expect(action(actionArgs())).resolves.toEqual({ error: "Permission denied." });
    expect(mocks.resetCreatorProfile).not.toHaveBeenCalled();
  });

  it("rejects cross-site requests before authenticating or changing data", async () => {
    const response = await action(actionArgs({ origin: "https://attacker.test" }));
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.resetCreatorProfile).not.toHaveBeenCalled();
  });

  it("resets both Supabase Auth and the local fallback password for the selected user", async () => {
    const request = new Request(`https://edicut.test/site/node-logmin/users/${userId}`, {
      method: "POST",
      headers: { Origin: "https://edicut.test" },
      body: new URLSearchParams({ intent: "reset-password", password: "StrongPassword123!", confirmPassword: "StrongPassword123!" }),
    });
    await expect(action({ ...actionArgs(), request })).resolves.toEqual({ success: "Password reset." });
    expect(mocks.updateSupabaseUserPasswordByEmail).toHaveBeenCalledWith({}, "client@example.com", "StrongPassword123!", userId);
    expect(mocks.db.update).toHaveBeenCalled();
  });

  it("removes the matching Supabase identity before permanently deleting a trashed account", async () => {
    mocks.db.query.users.findFirst.mockResolvedValue({ email: "client@example.com", deletedAt: new Date() });
    const order: string[] = [];
    mocks.deleteSupabaseUsersByEmail.mockImplementation(async () => { order.push("supabase"); return 1; });
    mocks.db.delete.mockReturnValue({ where: () => ({ returning: async () => { order.push("database"); return [{ id: userId }]; } }) });
    const request = new Request(`https://edicut.test/site/node-logmin/users/${userId}`, {
      method: "POST",
      headers: { Origin: "https://edicut.test" },
      body: new URLSearchParams({ intent: "permanent-delete" }),
    });
    const result = await action({ ...actionArgs(), request });
    expect(result).toBeInstanceOf(Response);
    expect(mocks.deleteSupabaseUsersByEmail).toHaveBeenCalledWith({}, ["client@example.com"]);
    expect(order).toEqual(["supabase", "database"]);
  });

  it("blocks permanent deletion when the email is shared with an admin identity", async () => {
    mocks.db.query.users.findFirst.mockResolvedValue({ email: "client@example.com", deletedAt: new Date() });
    mocks.db.query.adminUsers.findFirst.mockResolvedValue({ id: "admin-id" });
    const request = new Request(`https://edicut.test/site/node-logmin/users/${userId}`, {
      method: "POST",
      headers: { Origin: "https://edicut.test" },
      body: new URLSearchParams({ intent: "permanent-delete" }),
    });
    await expect(action({ ...actionArgs(), request })).resolves.toEqual({
      error: "This email is also used by an admin account. Change the admin email before permanently deleting this customer profile.",
    });
    expect(mocks.deleteSupabaseUsersByEmail).not.toHaveBeenCalled();
    expect(mocks.db.delete).not.toHaveBeenCalled();
  });
});
