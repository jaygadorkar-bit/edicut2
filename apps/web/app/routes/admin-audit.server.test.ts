import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: { id: "admin-id", email: "admin@example.com", active: true, role: "admin", passwordHash: "private-admin-hash" },
  directoryCount: 13, offsets: [] as number[], imageList: vi.fn(), videoList: vi.fn(), update: vi.fn(), delete: vi.fn(),
  session: { get: (key: string) => key === "adminUserId" ? "admin-id" : undefined },
}));
vi.mock("../lib/session.server", () => ({
  requireAdminUser: async () => mocks.admin, getAdminSession: async () => mocks.session,
  commitAdminSession: async () => "cookie", destroyAdminSession: async () => "cookie", isAdminRole: (role: string) => role === "admin",
}));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: async () => mocks.admin }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: async () => "allowed", requestBodyExceedsLimit: () => false }));
vi.mock("../lib/cloudinary.server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/cloudinary.server")>(),
  listCloudinaryImages: mocks.imageList, listCloudinaryVideos: mocks.videoList,
  getCloudinaryUsage: async () => null, getCloudinaryVideoUsage: async () => null,
}));
vi.mock("../lib/portfolio.server", async importOriginal => ({ ...await importOriginal<typeof import("../lib/portfolio.server")>(), getPortfolioSections: async () => [] }));
vi.mock("../lib/db.server", async importOriginal => {
  const { users, adminUsers } = await import("@edicut/db/schema");
  return { ...await importOriginal<typeof import("../lib/db.server")>(), getDbFromContext: () => ({
    update: mocks.update, delete: mocks.delete,
    select: (fields?: Record<string, unknown>) => ({ from: (table: unknown) => {
      const rows = !fields
        ? [{ id: "11111111-1111-4111-8111-111111111111", email: "client@example.com", active: true, passwordHash: "private-directory-hash" }]
        : fields.total ? [{ total: 13, admins: 1, managers: 0, support: 0, customers: 13, editors: 0, trash: 0 }]
        : fields.ownerId ? [] : [{ count: table === users || table === adminUsers ? mocks.directoryCount : 0 }];
      const promise = Promise.resolve(rows);
      const chain = Object.assign(promise, {
        where: () => chain, orderBy: () => chain, limit: () => chain, groupBy: () => chain,
        offset: (value: number) => { mocks.offsets.push(value); return chain; },
      });
      return chain;
    } }),
  }) };
});
import { action, loader } from "./admin";
async function load(search: string) {
  return loader({ request: new Request(`http://localhost:3002/site/node-logmin${search}`), context: {}, params: {} } as Parameters<typeof loader>[0]);
}
beforeEach(() => { vi.clearAllMocks(); mocks.directoryCount = 13; mocks.offsets.length = 0; mocks.imageList.mockResolvedValue([]); mocks.videoList.mockResolvedValue([]); });
describe("admin panel audit regressions", () => {
  it.each(["active", "admins"])("clamps huge page numbers before querying the %s directory", async view => {
    const result = await load(`?tab=users&view=${view}&page=99999999`);
    expect(result.data.currentPage).toBe(2); expect(result.data.totalPages).toBe(2); expect(mocks.offsets).toEqual([10]);
  });
  it("uses one valid page for an empty directory", async () => {
    mocks.directoryCount = 0;
    const result = await load("?tab=users&page=7");
    expect(result.data.totalPages).toBe(1); expect(mocks.offsets).toEqual([0]);
  });
  it.each(["active", "admins"])("never serializes password hashes from the %s directory", async view => {
    const result = await load(`?tab=users&view=${view}`);
    expect(JSON.stringify(result.data)).not.toContain("passwordHash");
    expect(JSON.stringify(result.data)).not.toContain("private-");
  });
  it.each(["images", "videos"])("surfaces %s provider failure instead of pretending the library is empty", async tab => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    (tab === "images" ? mocks.imageList : mocks.videoList).mockRejectedValue(new Error("private-provider-detail"));
    const result = await load(`?tab=${tab}`);
    const message = tab === "images" ? result.data.cloudinaryError : result.data.cloudinaryVideoError;
    expect(message).toContain("could not be loaded"); expect(message).not.toContain("private-provider-detail"); spy.mockRestore();
  });
  it.each(["bulk-delete", "bulk-restore", "bulk-permanent-delete", "bulk-update-role"])("rejects invalid account IDs before %s mutations", async intent => {
    const form = new URLSearchParams({ intent, userIds: "invalid-id", role: "customer" });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error"); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.delete).not.toHaveBeenCalled();
  });
  it.each([["payments", "/site/node-logmin/subscriptions"], ["messages", "/dashboard/messages"], ["unknown", "/site/node-logmin"]])("redirects obsolete %s views to usable navigation", async (tab, path) => {
    try { await load(`?tab=${tab}`); throw new Error("Expected redirect"); }
    catch (error) { expect(error).toBeInstanceOf(Response); expect((error as Response).headers.get("Location")).toBe(path); }
  });
});
