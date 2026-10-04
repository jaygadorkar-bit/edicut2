import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {};
  return {
    db,
    getAdminSession: vi.fn(async () => ({ get: (key: string) => key === "adminUserId" ? "admin-1" : undefined })),
    findAdminUserById: vi.fn(async () => ({ id: "admin-1", role: "admin", active: true })),
    requireAdminUser: vi.fn(async () => ({ id: "admin-1", role: "admin", active: true })),
    consumeUsageLimit: vi.fn(async () => "allowed"),
    saveRoleFeatureAccessSettings: vi.fn(async (_db: unknown, _access: Record<string, string[]>, _context: unknown) => undefined),
  };
});

vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: mocks.findAdminUserById }));
vi.mock("../lib/session.server", () => ({
  destroyAdminSession: vi.fn(),
  commitAdminSession: vi.fn(),
  getAdminSession: mocks.getAdminSession,
  isAdminRole: (role: string) => role === "admin",
  requireAdminUser: mocks.requireAdminUser,
}));
vi.mock("../lib/site-settings.server", () => ({
  saveRoleFeatureAccessSettings: mocks.saveRoleFeatureAccessSettings,
}));
vi.mock("../lib/usage-protection.server", () => ({
  consumeUsageLimit: mocks.consumeUsageLimit,
  requestBodyExceedsLimit: () => false,
}));

import { action } from "./admin";

beforeEach(() => vi.clearAllMocks());

describe("role permissions form submission", () => {
  it("persists the submitted matrix and synchronizes Customer with legacy user accounts", async () => {
    const form = new FormData();
    form.set("intent", "update-role-access");
    form.set("access__customer__overview", "on");
    form.set("access__customer__uploads", "on");
    form.set("access__customer__support", "on");
    form.set("access__customer_support__support", "on");
    const context = {};
    const request = new Request("http://localhost:3002/site/node-logmin?tab=roles", { method: "POST", body: form });

    await expect(action({ request, context } as Parameters<typeof action>[0])).resolves.toEqual({
      success: "Role access settings saved.",
    });

    const savedAccess = mocks.saveRoleFeatureAccessSettings.mock.calls[0]?.[1];
    expect(savedAccess).toMatchObject({
      customer: ["overview", "uploads"],
      user: ["overview", "uploads"],
      customer_support: ["support"],
    });
    expect(savedAccess?.customer).not.toContain("support");
    expect(mocks.saveRoleFeatureAccessSettings).toHaveBeenCalledWith(mocks.db, savedAccess, context);
  });
});
