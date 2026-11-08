import { beforeEach, describe, expect, it, vi } from "vitest";
const clientId = "11111111-1111-4111-8111-111111111111",
  managerId = "22222222-2222-4222-8222-222222222222",
  projectId = "33333333-3333-4333-8333-333333333333",
  editorId = "44444444-4444-4444-8444-444444444444";
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  auth: vi.fn(),
  assign: vi.fn(),
  notify: vi.fn(),
  mutate: vi.fn(),
  rooms: vi.fn(),
  mirror: vi.fn(),
  paid: vi.fn(),
}));
vi.mock("../components/admin/AdminClientsWorkspace", () => ({
  AdminClientsWorkspace: () => null,
}));
vi.mock("../lib/session.server", () => ({
  requireAdminUser: mocks.auth,
  isAdminRole: (role: string) => role === "admin",
}));
vi.mock("../lib/customer-subscriptions.server", async (original) => ({
  ...(await original<typeof import("../lib/customer-subscriptions.server")>()),
  markSubscriptionPaid: mocks.paid,
}));
vi.mock("../lib/db.server", () => ({
  getDbFromContext: () => ({ execute: mocks.execute }),
}));
vi.mock("../lib/client-project-managers.server", () => ({
  assignClientProjectManager: mocks.assign,
  importMissingClientProjectManagers: vi.fn(),
}));
vi.mock("../lib/chat-store.server", () => ({
  createChatStore: () => ({
    createChatRoomsForClient: mocks.rooms,
    assignChatManager: mocks.mirror,
  }),
}));
vi.mock("../lib/chat-realtime.server", () => ({
  notifyChatAccessChange: mocks.notify,
}));
vi.mock("../lib/project-review.server", () => ({
  reviewRows: (value: unknown) => value,
  mutateProjectReview: mocks.mutate,
  loadReviewEditorOptions: vi.fn(),
}));
vi.mock("../lib/usage-protection.server", async (original) => ({
  ...(await original<typeof import("../lib/usage-protection.server")>()),
  consumeUsageLimit: async () => "allowed",
}));
import { action } from "./admin-clients";
function submit(
  values: Record<string, string>,
  origin = "http://localhost:3002",
) {
  return action({
    request: new Request("http://localhost:3002/site/node-logmin/clients", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ clientId, ...values }),
    }),
    context: {},
    params: {},
  } as Parameters<typeof action>[0]);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({
    id: managerId,
    name: "Admin",
    role: "admin",
    active: true,
  });
  mocks.execute.mockResolvedValue([{ active: true, paid: false }]);
  mocks.assign.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined);
  mocks.mutate.mockResolvedValue({ success: "Editor assigned." });
  mocks.rooms.mockResolvedValue([{ id: projectId }]);
  mocks.mirror.mockResolvedValue(undefined);
  mocks.paid.mockResolvedValue(true);
});
describe("client assignment actions", () => {
  it("handles a global order mutation without requiring a selected client", async () => {
    const result = await submit({
      clientId: "",
      intent: "mark-paid",
      subscriptionId: projectId,
      expectedUpdatedAt: "2026-10-16T00:00:00.000Z",
    });
    expect(result).toHaveProperty("success");
    expect(mocks.paid).toHaveBeenCalledWith(
      expect.anything(),
      projectId,
      managerId,
      "2026-10-16T00:00:00.000Z",
    );
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("rejects cross-origin changes before reading credentials or data", async () => {
    expect(
      await submit(
        { intent: "assign-manager", managerId },
        "https://other.test",
      ),
    ).toBeInstanceOf(Response);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.assign).not.toHaveBeenCalled();
  });
  it("requires current administrator authentication", async () => {
    mocks.auth.mockRejectedValue(new Response("Denied", { status: 403 }));
    await expect(
      submit({ intent: "assign-manager", managerId }),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("assigns managers to unpaid clients without creating paid chat access", async () => {
    const result = await submit({
      intent: "assign-manager",
      managerId,
      expectedManagerId: "",
    });
    expect(result).toHaveProperty("success");
    expect(mocks.assign).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ admin: true }),
      clientId,
      managerId,
      null,
    );
    expect(mocks.rooms).not.toHaveBeenCalled();
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.anything(),
      {},
      expect.objectContaining({ userIds: [clientId, managerId] }),
    );
  });
  it("keeps the canonical result clear if a paid client's chat mirror is unavailable", async () => {
    mocks.execute.mockResolvedValue([{ active: true, paid: true }]);
    mocks.mirror.mockRejectedValue(new Error("D1 unavailable"));
    const result = await submit({ intent: "assign-manager", managerId });
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("warning");
    expect(mocks.assign).toHaveBeenCalledOnce();
  });
  it("shows stale manager assignment conflicts instead of silently replacing another admin's choice", async () => {
    mocks.assign.mockRejectedValue(
      new Response("Assignment changed. Refresh.", { status: 409 }),
    );
    expect(await submit({ intent: "assign-manager", managerId })).toEqual({
      error: "Assignment changed. Refresh.",
    });
    expect(mocks.rooms).not.toHaveBeenCalled();
  });
  it("checks project ownership before changing its editor", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ active: true, paid: false }])
      .mockResolvedValueOnce([]);
    expect(
      await submit({
        intent: "assign-project-editor",
        projectId,
        userId: editorId,
        expectedRevision: "0",
      }),
    ).toHaveProperty("error");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("reuses editor assignment revision protection for the selected client's project", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ active: true, paid: false }])
      .mockResolvedValueOnce([{ id: projectId }]);
    expect(
      await submit({
        intent: "assign-project-editor",
        projectId,
        userId: editorId,
        expectedRevision: "4",
      }),
    ).toHaveProperty("success");
    const form = mocks.mutate.mock.calls[0][3] as FormData;
    expect(form.get("intent")).toBe("set-editor");
    expect(form.get("expectedRevision")).toBe("4");
    expect(form.get("userId")).toBe(editorId);
  });
  it("rejects invalid choices without invoking an assignment write", async () => {
    expect(
      await submit({ intent: "assign-manager", managerId: "not-an-id" }),
    ).toHaveProperty("error");
    expect(mocks.assign).not.toHaveBeenCalled();
  });
});
