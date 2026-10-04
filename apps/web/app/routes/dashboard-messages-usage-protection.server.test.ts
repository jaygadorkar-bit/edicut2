import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const message = { id: "message-1", name: "Visitor", email: "visitor@example.com" };
  const selectLimit = vi.fn(async () => [message]);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const db = { select, update };

  return {
    db,
    findUserById: vi.fn(async () => ({ id: "staff-42", email: "staff@example.com", role: "customer_support", name: "Staff", active: true, deletedAt: null })),
    getDbFromContext: vi.fn(() => db),
    getRoleFeatureAccessSettings: vi.fn(async () => ({})),
    requireUserId: vi.fn(async () => "staff-42"),
    getAllowedDashboardFeatures: vi.fn(() => ["support"]),
    canAccessDashboardFeature: vi.fn(() => true),
    getDashboardLandingPath: vi.fn(() => "/dashboard"),
    updateSet,
    configureGmailRuntimeEnv: vi.fn(),
    sendMailViaGmail: vi.fn(async () => undefined),
  };
});

vi.mock("@edicut/platform-core/lib/gmail", () => ({
  configureGmailRuntimeEnv: mocks.configureGmailRuntimeEnv,
  sendMailViaGmail: mocks.sendMailViaGmail,
}));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.findUserById }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.getDbFromContext }));
vi.mock("../lib/session.server", () => ({
  requireUserId: mocks.requireUserId,
  getSession: async () => new Map(),
  getAdminSession: async () => new Map(),
  isAdminRole: (role: string) => role === "admin",
}));
vi.mock("../lib/site-settings.server", () => ({ getRoleFeatureAccessSettings: mocks.getRoleFeatureAccessSettings }));
vi.mock("../lib/role-feature-access", () => ({
  canAccessDashboardFeature: mocks.canAccessDashboardFeature,
  getAllowedDashboardFeatures: mocks.getAllowedDashboardFeatures,
  getDashboardLandingPath: mocks.getDashboardLandingPath,
}));

import { action } from "./dashboard-messages";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("dashboard email usage protection", () => {
  it("marks only valid, unique enquiry IDs as read without contacting Gmail", async () => {
    const form = new FormData();
    form.set("intent", "mark-read");
    form.append("messageIds", "550e8400-e29b-41d4-a716-446655440000");
    form.append("messageIds", "550e8400-e29b-41d4-a716-446655440000");
    form.append("messageIds", "not-a-uuid");
    const request = new Request("http://localhost:3002/dashboard/messages", { method: "POST", body: form });

    await expect(action({ request, context: {}, params: {} } as Parameters<typeof action>[0])).resolves.toEqual({ ok: true });
    expect(mocks.db.update).toHaveBeenCalledTimes(1);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "read", updatedAt: expect.any(Date) }));
    expect(mocks.sendMailViaGmail).not.toHaveBeenCalled();
  });

  it("does not write when the read request has no valid IDs", async () => {
    const form = new FormData();
    form.set("intent", "mark-read");
    form.append("messageIds", "bad-id");
    const request = new Request("http://localhost:3002/dashboard/messages", { method: "POST", body: form });

    await expect(action({ request, context: {}, params: {} } as Parameters<typeof action>[0])).resolves.toEqual({ ok: false });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it.each(["mark-read", "reply", "bulk-delete", "import"])("rejects cross-site %s requests before processing them", async (intent) => {
    const form = new FormData();
    form.set("intent", intent);
    const request = new Request("http://localhost:3002/dashboard/messages", {
      method: "POST",
      body: form,
      headers: { Origin: "https://example.net" },
    });

    const response = await action({ request, context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
    expect(mocks.requireUserId).not.toHaveBeenCalled();
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.db.update).not.toHaveBeenCalled();
    expect(mocks.sendMailViaGmail).not.toHaveBeenCalled();
  });

  it("stops replies before Gmail is called after two sends in a minute", async () => {
    const counters = new Map<string, number>();
    const emailLimit = vi.fn(async ({ key }: { key: string }) => {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return { success: count <= 2 };
    });
    const userLimit = vi.fn(async () => ({ success: true }));
    const context = {
      cf: { env: { EMAIL_SEND_LIMITER: { limit: emailLimit }, USER_ACTION_LIMITER: { limit: userLimit } } },
    };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const form = new FormData();
      form.set("intent", "reply");
      form.set("messageId", "message-1");
      form.set("subject", "A reply");
      form.set("reply", "This is a response to your project request.");
      const request = new Request("http://localhost:3002/dashboard/messages", { method: "POST", body: form });

      const response = await action({ request, context, params: {} } as Parameters<typeof action>[0]);
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
    }

    expect(emailLimit).toHaveBeenCalledTimes(3);
    expect(emailLimit.mock.calls.map(([input]) => input.key)).toEqual([
      "staff:staff-42",
      "staff:staff-42",
      "staff:staff-42",
    ]);
    expect(mocks.sendMailViaGmail).toHaveBeenCalledTimes(2);
    expect(mocks.db.select).toHaveBeenCalledTimes(2);
    expect(mocks.db.update).toHaveBeenCalledTimes(2);
  });
});
