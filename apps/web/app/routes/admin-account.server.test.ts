import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  db: { query: { adminUsers: { findFirst: vi.fn() } }, update: vi.fn() },
  verifyPassword: vi.fn(),
  consumeUsageLimit: vi.fn(),
  updateSupabaseUserEmailByEmail: vi.fn(),
  updateSupabaseUserPasswordByEmail: vi.fn(),
}));

vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("../lib/session.server", () => ({ requireAdminUser: mocks.admin }));
vi.mock("../lib/password.server", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.consumeUsageLimit, requestBodyExceedsLimit: () => false }));
vi.mock("../integrations/supabase/client.server", () => ({
  updateSupabaseUserEmailByEmail: mocks.updateSupabaseUserEmailByEmail,
  updateSupabaseUserPasswordByEmail: mocks.updateSupabaseUserPasswordByEmail,
}));

import { action } from "./admin-account";

const admin = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Admin", email: "admin@example.com", passwordHash: "local-hash", active: true, role: "admin" };
const url = "https://edicut.test/site/node-logmin/account";
const context = {};

function actionArgs(fields: Record<string, string>) {
  const request = new Request(url, { method: "POST", headers: { Origin: new URL(url).origin }, body: new URLSearchParams(fields) });
  return { request, context, params: {}, url: new URL(url), pattern: "/site/node-logmin/account" } as Parameters<typeof action>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue(admin);
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.consumeUsageLimit.mockResolvedValue("allowed");
  mocks.db.query.adminUsers.findFirst.mockResolvedValue(null);
  mocks.db.update.mockReturnValue({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) });
  mocks.updateSupabaseUserEmailByEmail.mockResolvedValue(false);
  mocks.updateSupabaseUserPasswordByEmail.mockResolvedValue(false);
});

describe("admin account credential consistency", () => {
  it("updates Supabase Auth and the local fallback hash after current-password verification", async () => {
    const result = await action(actionArgs({
      intent: "change-password",
      currentPassword: "OldPassword123!",
      password: "NewPassword123!",
      confirmPassword: "NewPassword123!",
    }));
    expect(result).toEqual({ intent: "change-password", success: "Admin password updated." });
    expect(mocks.verifyPassword).toHaveBeenCalledWith("OldPassword123!", admin.passwordHash);
    expect(mocks.updateSupabaseUserPasswordByEmail).toHaveBeenCalledWith(context, admin.email, "NewPassword123!");
    expect(mocks.db.update).toHaveBeenCalled();
  });

  it("leaves the local credential unchanged when the Auth provider rejects the update", async () => {
    mocks.updateSupabaseUserPasswordByEmail.mockRejectedValue(new Error("provider unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await action(actionArgs({
      intent: "change-password",
      currentPassword: "OldPassword123!",
      password: "NewPassword123!",
      confirmPassword: "NewPassword123!",
    }));
    expect(result).toHaveProperty("error", expect.stringContaining("authentication connection"));
    expect(mocks.db.update).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("updates the matching Supabase identity when an administrator changes their email", async () => {
    const result = await action(actionArgs({ intent: "save-profile", name: "Admin", email: "new-admin@example.com", phone: "" }));
    expect(result).toBeInstanceOf(Response);
    expect(mocks.updateSupabaseUserEmailByEmail).toHaveBeenCalledWith(context, admin.email, "new-admin@example.com");
    expect(mocks.db.update).toHaveBeenCalled();
  });
});
