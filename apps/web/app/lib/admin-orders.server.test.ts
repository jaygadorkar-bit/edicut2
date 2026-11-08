import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  paid: vi.fn(),
  unpaid: vi.fn(),
  remove: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("./customer-subscriptions.server", async (original) => ({
  ...(await original<typeof import("./customer-subscriptions.server")>()),
  listAdminSubscriptions: mocks.list,
  markSubscriptionPaid: mocks.paid,
  markSubscriptionUnpaid: mocks.unpaid,
  deleteAdminSubscription: mocks.remove,
}));
vi.mock("./chat-realtime.server", () => ({
  notifyChatAccessChange: mocks.notify,
}));
import { loadAdminOrders, mutateAdminOrder } from "./admin-orders.server";
import type { DatabaseClient } from "@edicut/db/client";
const clientId = "11111111-1111-4111-8111-111111111111",
  orderId = "22222222-2222-4222-8222-222222222222";
let summary: { total: number; paid: number; unpaid: number };
const where = vi.fn(async () => [summary]);
const db = {
  select: () => ({ from: () => ({ where }) }),
} as unknown as DatabaseClient;
const request = (query = "") =>
  new Request(`http://localhost:3002/site/node-logmin/clients${query}`);
beforeEach(() => {
  vi.clearAllMocks();
  summary = { total: 51, paid: 30, unpaid: 21 };
  mocks.list.mockResolvedValue([]);
  mocks.paid.mockResolvedValue(true);
  mocks.unpaid.mockResolvedValue(true);
  mocks.remove.mockResolvedValue(true);
  mocks.notify.mockResolvedValue(undefined);
});
describe("merged order reads", () => {
  it("defaults to all orders, with bounded results and a next-page flag", async () => {
    mocks.list.mockResolvedValue(
      Array.from({ length: 26 }, (_, id) => ({ subscription: { id } })),
    );
    const result = await loadAdminOrders(db, request());
    expect(result.status).toBe("all");
    expect(result.records).toHaveLength(25);
    expect(result.hasNext).toBe(true);
    expect(mocks.list).toHaveBeenCalledWith(db, 1, "all", undefined, undefined);
  });
  it("clamps pagination against the selected payment status", async () => {
    expect(
      (await loadAdminOrders(db, request("?status=paid&page=99"))).page,
    ).toBe(2);
    expect(mocks.list).toHaveBeenCalledWith(
      db,
      2,
      "paid",
      undefined,
      undefined,
    );
  });
  it("uses separate pagination and an owner constraint for a client's orders", async () => {
    await loadAdminOrders(
      db,
      request("?status=paid&page=99&orderPage=2"),
      clientId,
    );
    expect(mocks.list).toHaveBeenCalledWith(db, 2, "paid", undefined, clientId);
    expect(where).toHaveBeenCalled();
  });
  it("keeps the client owner constraint when opening an order event", async () => {
    await loadAdminOrders(
      db,
      request(`?event=${orderId}&orderPage=9`),
      clientId,
    );
    expect(mocks.list).toHaveBeenCalledWith(db, 1, "all", orderId, clientId);
  });
  it("rejects malformed IDs before querying", async () => {
    await expect(
      loadAdminOrders(db, request("?event=bad")),
    ).rejects.toMatchObject({ status: 404 });
    await expect(loadAdminOrders(db, request(), "bad")).rejects.toMatchObject({
      status: 404,
    });
    expect(mocks.list).not.toHaveBeenCalled();
    expect(where).not.toHaveBeenCalled();
  });
});
describe("shared guarded order mutations", () => {
  const admin = { id: "admin", role: "admin", active: true };
  const form = (intent: string) => new FormData();
  async function submit(intent: string, actor = admin) {
    const data = form(intent);
    data.set("intent", intent);
    data.set("subscriptionId", orderId);
    data.set("expectedUpdatedAt", "2026-10-16T00:00:00.000Z");
    return mutateAdminOrder(db, {}, actor, data);
  }
  it("records the authenticated admin and preserves the displayed revision", async () => {
    expect(await submit("mark-paid")).toHaveProperty("success");
    expect(mocks.paid).toHaveBeenCalledWith(
      db,
      orderId,
      "admin",
      "2026-10-16T00:00:00.000Z",
    );
  });
  it.each(["mark-unpaid", "delete-purchase"])(
    "retains the project-work guard for %s",
    async (intent) => {
      mocks.unpaid.mockResolvedValue(false);
      mocks.remove.mockResolvedValue(false);
      expect(await submit(intent)).toHaveProperty(
        "error",
        expect.stringContaining("project work"),
      );
      expect(mocks.notify).not.toHaveBeenCalled();
    },
  );
  it.each([
    { ...admin, active: false },
    { ...admin, role: "customer" },
  ])("rejects unauthorized actors", async (actor) => {
    await expect(submit("mark-paid", actor)).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.paid).not.toHaveBeenCalled();
  });
  it("reports a saved mutation honestly if live notification fails", async () => {
    mocks.notify.mockRejectedValue(new Error("Unavailable"));
    expect(await submit("mark-paid")).toMatchObject({
      success: expect.any(String),
      warning: expect.any(String),
    });
  });
});
