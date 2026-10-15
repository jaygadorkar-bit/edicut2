import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  userId: vi.fn(),
  user: vi.fn(),
  settings: vi.fn(),
  feed: vi.fn(),
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
}));
vi.mock("../lib/usage-protection.server", () => ({
  consumeUsageLimit: mocks.limit,
}));
import { loader } from "./api-notifications";
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
});
describe("workspace notification endpoint", () => {
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
