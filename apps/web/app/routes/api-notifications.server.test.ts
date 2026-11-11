import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  userId: vi.fn(),
  user: vi.fn(),
  settings: vi.fn(),
  feed: vi.fn(),
  setRead: vi.fn(),
  setUserRead: vi.fn(),
  importRead: vi.fn(),
  importUserRead: vi.fn(),
  invalidate: vi.fn(),
  limit: vi.fn(),
  db: {},
}));
vi.mock("../lib/session.server", () => ({
  requireAdminUser: mocks.admin,
  requireUserId: mocks.userId,
}));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.user }));
vi.mock("../lib/site-settings.server", () => ({
  getRoleFeatureAccessSettings: mocks.settings,
}));
vi.mock("../lib/notifications.server", () => ({
  getWorkspaceNotificationFeed: mocks.feed,
  importAdminWorkspaceEventReads: mocks.importRead,
  importUserWorkspaceEventReads: mocks.importUserRead,
  setAdminWorkspaceEventsRead: mocks.setRead,
  setUserWorkspaceEventsRead: mocks.setUserRead,
}));
vi.mock("../lib/usage-protection.server", () => ({
  consumeUsageLimit: mocks.limit,
}));
vi.mock("../lib/notification-realtime.server", () => ({
  sendWorkspaceReceiptInvalidation: mocks.invalidate,
}));
import { action, loader } from "./api-notifications";
const args = (scope = "client") => ({
  request: new Request(
    `http://localhost:3002/api/notifications?scope=${scope}`,
  ),
  context: {},
  params: {},
  url: new URL("http://localhost"),
  pattern: "/api/notifications",
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.admin.mockResolvedValue({ id: "admin", active: true, role: "admin" });
  mocks.userId.mockResolvedValue("customer");
  mocks.user.mockResolvedValue({
    id: "customer",
    active: true,
    role: "customer",
    deletedAt: null,
  });
  mocks.settings.mockResolvedValue({});
  mocks.limit.mockResolvedValue("allowed");
  mocks.feed.mockResolvedValue({
    identity: "user:customer",
    events: [],
    partial: false,
  });
  mocks.setRead.mockImplementation(async (_db, _adminId, eventIds, read) => ({
    eventIds,
    readAt: read ? "2026-10-14T08:00:00.000Z" : null,
    readBy: read ? "admin" : null,
  }));
  mocks.setUserRead.mockImplementation(async (_db, _userId, eventIds, read) => ({
    eventIds,
    readAt: read ? "2026-10-14T08:00:00.000Z" : null,
    readBy: read ? "customer" : null,
  }));
  mocks.importRead.mockResolvedValue([]);
  mocks.importUserRead.mockResolvedValue([]);
  mocks.invalidate.mockResolvedValue(true);
});
describe("workspace notification endpoint", () => {
  it("clears a rejected admin cookie after a receipt mutation needs reauthentication", async () => {
    mocks.admin.mockRejectedValue(new Response(null, { status: 302, headers: { Location: "/signin", "Set-Cookie": "_edicut_admin=; Max-Age=0; Path=/" } }));
    const input = args("admin");
    input.request = new Request(input.request.url, { method: "PATCH", headers: { Origin: new URL(input.request.url).origin, "Content-Type": "application/json" }, body: JSON.stringify({ eventIds: [], read: true }) });
    const response = await action(input);
    expect(response.status).toBe(401);
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(mocks.setRead).not.toHaveBeenCalled();
  });
  it("allows an authenticated admin to update only event IDs in the current feed", async () => {
    mocks.feed.mockResolvedValueOnce({ events: [{ id: "enquiry:known" }] });
    const input = args("admin");
    input.request = new Request(`${input.request.url}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: new URL(input.request.url).origin },
      body: JSON.stringify({ eventIds: ["enquiry:known", "forged"], read: true }),
    });
    const response = await action(input);
    expect(response.status).toBe(200);
    expect(mocks.setRead).toHaveBeenCalledWith(mocks.db, "admin", ["enquiry:known"], true);
    expect(mocks.invalidate).toHaveBeenCalledWith(
      input.context,
      expect.objectContaining({ id: "admin", admin: true }),
    );
    expect(await response.json()).toMatchObject({ eventIds: ["enquiry:known"], readBy: "admin" });
  });
  it("allows a client to update only event IDs in that account's current feed", async () => {
    mocks.feed.mockResolvedValueOnce({ events: [{ id: "project:known" }] });
    const input = args("client");
    input.request = new Request(input.request.url, {
      method: "PATCH",
      headers: { Origin: new URL(input.request.url).origin, "Content-Type": "application/json" },
      body: JSON.stringify({ eventIds: ["project:known", "forged"], read: true }),
    });
    const response = await action(input);
    expect(response.status).toBe(200);
    expect(mocks.setUserRead).toHaveBeenCalledWith(mocks.db, "customer", ["project:known"], true);
    expect(mocks.invalidate).toHaveBeenCalledWith(
      input.context,
      expect.objectContaining({ id: "customer", admin: false }),
    );
    expect(await response.json()).toMatchObject({ eventIds: ["project:known"], readBy: "customer" });
    expect(mocks.setRead).not.toHaveBeenCalled();
  });
  it("imports only recent client receipts for events in that account's feed", async () => {
    const occurredAt = new Date(Date.now() - 60_000).toISOString();
    mocks.feed.mockResolvedValueOnce({ events: [{ id: "project:known", occurredAt }] });
    const input = args("client");
    const wrongAccount = args("client");
    wrongAccount.request = new Request(wrongAccount.request.url, {
      method: "PATCH",
      headers: { Origin: new URL(wrongAccount.request.url).origin, "Content-Type": "application/json" },
      body: JSON.stringify({ identity: "user:another-customer", legacyReads: [] }),
    });
    expect((await action(wrongAccount)).status).toBe(403);
    input.request = new Request(input.request.url, {
      method: "PATCH",
      headers: { Origin: new URL(input.request.url).origin, "Content-Type": "application/json" },
      body: JSON.stringify({ identity: "user:customer", legacyReads: [
        { eventId: "project:known", readAt: new Date().toISOString() },
        { eventId: "forged", readAt: new Date().toISOString() },
      ] }),
    });
    expect((await action(input)).status).toBe(200);
    expect(mocks.importUserRead).toHaveBeenCalledWith(
      mocks.db,
      "customer",
      [expect.objectContaining({ eventId: "project:known" })],
    );
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
  it("invalidates the viewer's channel after importing new receipts", async () => {
    const input = args();
    mocks.feed.mockResolvedValueOnce({ events: [{ id: "project:known" }] });
    mocks.importUserRead.mockResolvedValueOnce(["project:known"]);
    input.request = new Request(input.request.url, {
      method: "PATCH",
      headers: { Origin: new URL(input.request.url).origin, "Content-Type": "application/json" },
      body: JSON.stringify({ identity: "user:customer", legacyReads: [
        { eventId: "project:known", readAt: new Date().toISOString() },
      ] }),
    });

    expect((await action(input)).status).toBe(200);
    expect(mocks.invalidate).toHaveBeenCalledWith(
      input.context,
      expect.objectContaining({ id: "customer", admin: false }),
    );
  });
  it("keeps a saved receipt successful if Realtime delivery is unavailable", async () => {
    mocks.feed.mockResolvedValueOnce({ events: [{ id: "project:known" }] });
    mocks.invalidate.mockResolvedValueOnce(false);
    const input = args();
    input.request = new Request(input.request.url, {
      method: "PATCH",
      headers: { Origin: new URL(input.request.url).origin, "Content-Type": "application/json" },
      body: JSON.stringify({ eventIds: ["project:known"], read: true }),
    });

    expect((await action(input)).status).toBe(200);
  });
  it("rejects invalid scopes and malformed or oversized receipt mutations", async () => {
    const input = args("public");
    input.request = new Request(input.request.url, { method: "PATCH", headers: { Origin: new URL(input.request.url).origin, "Content-Type": "application/json" }, body: JSON.stringify({ eventIds: [], read: true }) });
    expect((await action(input)).status).toBe(400);
    const malformed = args("admin");
    malformed.request = new Request(malformed.request.url, { method: "PATCH", headers: { Origin: new URL(malformed.request.url).origin, "Content-Type": "application/json" }, body: JSON.stringify({ eventIds: ["x".repeat(181)], read: true }) });
    expect((await action(malformed)).status).toBe(400);
    expect(mocks.setRead).not.toHaveBeenCalled();
    expect(mocks.setUserRead).not.toHaveBeenCalled();
  });
  it("uses the authenticated viewer and current role features, never a submitted identity", async () => {
    const input = args();
    input.request = new Request(
      input.request.url + "&userId=another-customer&role=admin",
    );
    const response = await loader(input);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.feed).toHaveBeenCalledWith(
      mocks.db,
      expect.objectContaining({
        id: "customer",
        admin: false,
        role: "customer",
      }),
    );
  });
  it("checks fresh administrator access before reading privileged events", async () => {
    mocks.admin.mockRejectedValue(new Response("Forbidden", { status: 403 }));
    expect((await loader(args("admin"))).status).toBe(403);
    expect(mocks.feed).not.toHaveBeenCalled();
  });
  it("rejects inactive or deleted client accounts", async () => {
    mocks.user.mockResolvedValue({ active: false });
    expect((await loader(args())).status).toBe(403);
    expect(mocks.feed).not.toHaveBeenCalled();
  });
  it("does not return private events after session expiry", async () => {
    mocks.userId.mockRejectedValue(
      new Response(null, { status: 302, headers: { Location: "/signin" } }),
    );
    expect((await loader(args())).status).toBe(401);
    expect(mocks.feed).not.toHaveBeenCalled();
  });
  it("bounds refresh frequency and rejects invalid scopes", async () => {
    expect((await loader(args("public"))).status).toBe(400);
    mocks.limit.mockResolvedValue("blocked");
    expect((await loader(args())).status).toBe(429);
    expect(mocks.feed).not.toHaveBeenCalled();
  });
  it("preserves a successful same-endpoint session refresh without treating it as expiry", async () => {
    const input = args();
    mocks.userId.mockRejectedValue(
      new Response(null, {
        status: 302,
        headers: {
          Location: input.request.url,
          "Set-Cookie": "test-refreshed-cookie",
        },
      }),
    );
    const response = await loader(input);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(input.request.url);
    expect(response.headers.get("Set-Cookie")).toBe("test-refreshed-cookie");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.feed).not.toHaveBeenCalled();
  });
  it("redacts connection details instead of reporting no notifications", async () => {
    mocks.feed.mockRejectedValue(
      new Error(
        "postgres://secret-password@private-host Failed query: customer",
      ),
    );
    const response = await loader(args());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(
      /secret-password|private-host|Failed query/,
    );
  });
});
