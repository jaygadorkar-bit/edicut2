import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: { userId: "user-id", adminUserId: "verified-admin", adminAccessVerified: true } as Record<string, unknown>,
  adminSession: { adminUserId: "admin-id" } as Record<string, unknown>,
  getDbFromContext: vi.fn(() => ({})),
  getAdminToolbarAccess: vi.fn(async () => "verified"),
  getAdminNavigationCounts: vi.fn(async () => ({ pendingOrderCount: 3, unreadEnquiryCount: 7 })),
}));
vi.mock("../lib/session.server", () => ({
  getSession: vi.fn(async () => ({ get: (key: string) => mocks.session[key] })),
  getAdminSession: vi.fn(async () => ({ get: (key: string) => mocks.adminSession[key] })),
}));
vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.getDbFromContext }));
vi.mock("../lib/admin-toolbar-access.server", () => ({ getAdminToolbarAccess: mocks.getAdminToolbarAccess }));
vi.mock("../lib/admin-navigation-counts.server", () => ({ getAdminNavigationCounts: mocks.getAdminNavigationCounts }));
import { loader } from "./admin-navigation-counts";
const args = () => ({ request: new Request("http://localhost:3002/site/node-logmin/navigation-counts"), url: new URL("http://localhost:3002/site/node-logmin/navigation-counts"), pattern: "/site/node-logmin/navigation-counts", params: {}, context: {} });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { userId: "user-id", adminUserId: "verified-admin", adminAccessVerified: true };
  mocks.adminSession = { adminUserId: "admin-id" };
  mocks.getAdminToolbarAccess.mockResolvedValue("verified");
});

describe("admin notification endpoint", () => {
  it("returns only counts with no-store headers after checking current admin access", async () => {
    const response = await loader(args());
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ pendingOrderCount: 3, unreadEnquiryCount: 7 });
    expect(mocks.getAdminToolbarAccess).toHaveBeenCalledWith(expect.anything(), {
      userId: "user-id", adminUserId: "admin-id", verifiedUserAdminId: "verified-admin",
    });
  });
  it("does not query counts for a customer, inactive admin, or revoked admin session", async () => {
    mocks.getAdminToolbarAccess.mockResolvedValue("none");
    const response = await loader(args());
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getAdminNavigationCounts).not.toHaveBeenCalled();
  });
  it("does not access the database for an anonymous request", async () => {
    mocks.session = {}; mocks.adminSession = {};
    expect((await loader(args())).status).toBe(403);
    expect(mocks.getDbFromContext).not.toHaveBeenCalled();
  });
  it("accepts a verified user admin identity without an admin cookie and ignores unverified submitted roles", async () => {
    mocks.adminSession = {};
    await loader(args());
    expect(mocks.getAdminToolbarAccess).toHaveBeenLastCalledWith(expect.anything(), {
      userId: "user-id", adminUserId: undefined, verifiedUserAdminId: "verified-admin",
    });
    mocks.session.adminAccessVerified = false;
    await loader(args());
    expect(mocks.getAdminToolbarAccess).toHaveBeenLastCalledWith(expect.anything(), {
      userId: "user-id", adminUserId: undefined, verifiedUserAdminId: undefined,
    });
  });
});
