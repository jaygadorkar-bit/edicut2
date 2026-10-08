import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  admin: { id: "admin-id", email: "admin@example.com", active: true, role: "admin", passwordHash: "private-admin-hash" },
  directoryCount: 13, offsets: [] as number[], imageList: vi.fn(), videoList: vi.fn(), deleteImages: vi.fn(), deleteVideos: vi.fn(),
  uploadImage: vi.fn(), uploadVideo: vi.fn(),
  portfolioSections: [] as any[], pricingPackages: [] as any[], portfolioRead: vi.fn(), savePortfolio: vi.fn(), savePricing: vi.fn(),
  events: [] as string[], savedPortfolio: [] as any[], savedPricing: [] as any[], update: vi.fn(), delete: vi.fn(), execute: vi.fn(),
  trashedUsers: [] as Array<{ id: string; email: string }>, adminEmails: [] as Array<{ email: string }>, deleteSupabaseUsersByEmail: vi.fn(),
  session: { get: (key: string) => key === "adminUserId" ? "admin-id" : undefined },
}));
vi.mock("../lib/session.server", () => ({
  requireAdminUser: async () => mocks.admin, getAdminSession: async () => mocks.session,
  commitAdminSession: async () => "cookie", destroyAdminSession: async () => "cookie", isAdminRole: (role: string) => role === "admin",
}));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: async () => mocks.admin }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: async () => "allowed", requestBodyExceedsLimit: () => false }));
vi.mock("../integrations/supabase/client.server", () => ({ deleteSupabaseUsersByEmail: mocks.deleteSupabaseUsersByEmail }));
vi.mock("../lib/cloudinary.server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/cloudinary.server")>(),
  listCloudinaryImages: mocks.imageList, listCloudinaryVideos: mocks.videoList,
  uploadPackageImageToCloudinary: mocks.uploadImage,
  uploadPortfolioVideoToCloudinary: mocks.uploadVideo,
  deleteCloudinaryImages: mocks.deleteImages, deleteCloudinaryVideos: mocks.deleteVideos,
  getCloudinaryUsage: async () => null, getCloudinaryVideoUsage: async () => null,
}));
vi.mock("../lib/portfolio.server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/portfolio.server")>(),
  getPortfolioSections: mocks.portfolioRead,
  savePortfolioSections: mocks.savePortfolio,
}));
vi.mock("../lib/pricing.server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/pricing.server")>(),
  getPricingPackages: async () => mocks.pricingPackages,
  savePricingPackages: mocks.savePricing,
}));
vi.mock("../lib/db.server", async importOriginal => {
  const { users, adminUsers } = await import("@edicut/db/schema");
  return { ...await importOriginal<typeof import("../lib/db.server")>(), getDbFromContext: () => ({
    update: mocks.update, delete: mocks.delete, execute: mocks.execute,
    select: (fields?: Record<string, unknown>) => ({ from: (table: unknown) => {
      const rows = !fields
        ? [{ id: "11111111-1111-4111-8111-111111111111", email: "client@example.com", active: true, passwordHash: "private-directory-hash" }]
        : fields.total ? [{ total: 13, admins: 1, managers: 0, support: 0, customers: 13, editors: 0, trash: 0 }]
        : fields.ownerId ? []
        : fields.id && fields.email && table === users ? mocks.trashedUsers
        : fields.email && table === adminUsers ? mocks.adminEmails
        : [{ count: table === users || table === adminUsers ? mocks.directoryCount : 0 }];
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.directoryCount = 13; mocks.offsets.length = 0; mocks.events.length = 0;
  mocks.portfolioSections.length = 0; mocks.pricingPackages.length = 0;
  mocks.savedPortfolio.length = 0; mocks.savedPricing.length = 0;
  mocks.trashedUsers.length = 0; mocks.adminEmails.length = 0;
  mocks.portfolioRead.mockImplementation(async () => mocks.portfolioSections);
  mocks.imageList.mockResolvedValue([]); mocks.videoList.mockResolvedValue([]);
  mocks.uploadImage.mockImplementation(async (file: File) => ({ public_id: `edicut/packages/${file.name}`, secure_url: `https://res.cloudinary.com/edicut/image/upload/edicut/packages/${file.name}`, bytes: file.size }));
  mocks.uploadVideo.mockResolvedValue({ public_id: "edicut/portfolio/uploaded", secure_url: "https://res.cloudinary.com/edicut/video/upload/edicut/portfolio/uploaded.mp4", bytes: 4 });
  mocks.deleteImages.mockImplementation(async () => { mocks.events.push("delete-images"); });
  mocks.deleteVideos.mockImplementation(async () => { mocks.events.push("delete-videos"); });
  mocks.savePortfolio.mockImplementation(async (_db: unknown, sections: any[]) => { mocks.events.push("save-portfolio"); mocks.savedPortfolio.push(sections); });
  mocks.savePricing.mockImplementation(async (_db: unknown, packages: any[]) => { mocks.events.push("save-pricing"); mocks.savedPricing.push(packages); });
  mocks.execute.mockResolvedValue([]);
  mocks.deleteSupabaseUsersByEmail.mockImplementation(async (_context: unknown, emails: string[]) => { mocks.events.push("delete-auth"); return emails.length; });
});
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
  it("permanently removes only selected trashed records after matching Auth identities", async () => {
    const selectedId = "11111111-1111-4111-8111-111111111111";
    const anotherId = "22222222-2222-4222-8222-222222222222";
    mocks.trashedUsers.push({ id: selectedId, email: "client@example.com" });
    mocks.delete.mockReturnValue({ where: () => ({ returning: async () => { mocks.events.push("delete-local"); return [{ id: selectedId }]; } }) });
    const form = new URLSearchParams({ intent: "bulk-permanent-delete", userIds: selectedId });
    form.append("userIds", anotherId);
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toEqual({ success: "Permanently deleted 1 user." });
    expect(mocks.deleteSupabaseUsersByEmail).toHaveBeenCalledWith({}, ["client@example.com"]);
    expect(mocks.events).toEqual(["delete-auth", "delete-local"]);
  });
  it("blocks bulk deletion when any selected trashed email belongs to an admin", async () => {
    const selectedId = "11111111-1111-4111-8111-111111111111";
    mocks.trashedUsers.push({ id: selectedId, email: "client@example.com" });
    mocks.adminEmails.push({ email: " CLIENT@example.com " });
    const form = new URLSearchParams({ intent: "bulk-permanent-delete", userIds: selectedId });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", expect.stringContaining("also used by an admin account"));
    expect(mocks.deleteSupabaseUsersByEmail).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it("keeps the local record in trash if Auth deletion fails", async () => {
    const selectedId = "11111111-1111-4111-8111-111111111111";
    mocks.trashedUsers.push({ id: selectedId, email: "client@example.com" });
    mocks.deleteSupabaseUsersByEmail.mockRejectedValue(new Error("provider unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const form = new URLSearchParams({ intent: "bulk-permanent-delete", userIds: selectedId });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", expect.stringContaining("remain in trash"));
    expect(mocks.delete).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it.each(["workspace-project-status", "workspace-project-billing"])("rejects stale or invalid project timestamps before %s updates", async intent => {
    const form = new URLSearchParams({ intent, projectId: "11111111-1111-4111-8111-111111111111", status: "editing", billingStatus: "quote_approved", finalAmount: "100" });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", expect.stringContaining("changed while you were reviewing"));
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("prevents a stale customer-review status form from publishing an old preview", async () => {
    const form = new URLSearchParams({
      intent: "workspace-project-status", projectId: "11111111-1111-4111-8111-111111111111",
      status: "review", expectedUpdatedAt: "2026-10-06T00:00:00.000Z", reviewUrl: "https://drive.google.com/file/d/preview",
    });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", expect.stringContaining("changed while you were reviewing"));
    const statement = new (await import("drizzle-orm/pg-core")).PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(statement.sql).toContain("date_trunc('milliseconds', updated_at)");
  });
  it("deletes only the selected video and saves portfolio references before deleting the asset", async () => {
    const selectedUrl = "https://res.cloudinary.com/edicut/video/upload/edicut/portfolio/selected.mp4";
    const retainedUrl = "https://res.cloudinary.com/edicut/video/upload/edicut/portfolio/retained.mp4";
    mocks.videoList.mockResolvedValue([
      { public_id: "edicut/portfolio/selected", secure_url: selectedUrl },
      { public_id: "edicut/portfolio/retained", secure_url: retainedUrl },
    ]);
    mocks.portfolioSections.push({
      id: "featured", name: "Featured", slug: "featured", active: true, sortOrder: 1,
      videos: [{ id: "selected", videoUrl: selectedUrl }, { id: "retained", videoUrl: retainedUrl }],
    });
    const form = new URLSearchParams({ intent: "delete-portfolio-videos", publicIds: "edicut/portfolio/selected" });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("success", "Deleted 1 portfolio video.");
    expect(mocks.savedPortfolio[0][0].videos.map((video: any) => video.videoUrl)).toEqual([retainedUrl]);
    expect(mocks.deleteVideos).toHaveBeenCalledWith(["edicut/portfolio/selected"], {});
    expect(mocks.portfolioRead.mock.calls[0][2]).toEqual({ failOnError: true });
    expect(mocks.events).toEqual(["save-portfolio", "delete-videos"]);
  });
  it("does not change the portfolio or delete files when saved sections cannot be read", async () => {
    mocks.videoList.mockResolvedValue([{ public_id: "edicut/portfolio/selected", secure_url: "https://res.cloudinary.com/edicut/video/upload/edicut/portfolio/selected.mp4" }]);
    mocks.portfolioRead.mockRejectedValue(new Error("settings store unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const form = new URLSearchParams({ intent: "delete-portfolio-videos", publicIds: "edicut/portfolio/selected" });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", "Could not verify the selected videos or update the portfolio, so no files were deleted. Refresh and try again.");
    expect(mocks.savePortfolio).not.toHaveBeenCalled();
    expect(mocks.deleteVideos).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("removes a newly uploaded portfolio video if saving its section fails", async () => {
    mocks.portfolioSections.push({ id: "featured", name: "Featured", slug: "featured", active: true, sortOrder: 1, videos: [] });
    mocks.savePortfolio.mockRejectedValueOnce(new Error("database unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const form = new FormData();
    form.set("intent", "upload-portfolio-video");
    form.set("title", "Sample video");
    form.set("sectionSlug", "featured");
    form.append("videoFile", new File(["clip"], "sample.mp4", { type: "video/mp4" }));
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", expect.stringContaining("uploaded video was removed"));
    expect(mocks.deleteVideos).toHaveBeenCalledWith(["edicut/portfolio/uploaded"], {});
    spy.mockRestore();
  });
  it("deletes only the selected image and keeps unrelated package gallery assets", async () => {
    const selectedUrl = "https://res.cloudinary.com/edicut/image/upload/edicut/packages/selected.jpg";
    const retainedUrl = "https://res.cloudinary.com/edicut/image/upload/edicut/packages/retained.jpg";
    mocks.imageList.mockResolvedValue([
      { public_id: "edicut/packages/selected", secure_url: selectedUrl },
      { public_id: "edicut/packages/retained", secure_url: retainedUrl },
    ]);
    mocks.pricingPackages.push({ id: "starter", galleryImages: [selectedUrl, retainedUrl] });
    const form = new URLSearchParams({ intent: "delete-images", publicIds: "edicut/packages/selected" });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("success", "Deleted 1 image.");
    expect(mocks.savedPricing[0][0].galleryImages).toEqual([retainedUrl]);
    expect(mocks.deleteImages).toHaveBeenCalledWith(["edicut/packages/selected"], {});
    expect(mocks.events).toEqual(["save-pricing", "delete-images"]);
  });
  it("does not delete an image when package references could not be saved", async () => {
    mocks.imageList.mockResolvedValue([{ public_id: "edicut/packages/selected", secure_url: "https://res.cloudinary.com/edicut/image/upload/edicut/packages/selected.jpg" }]);
    mocks.pricingPackages.push({ id: "starter", galleryImages: ["https://res.cloudinary.com/edicut/image/upload/edicut/packages/selected.jpg"] });
    mocks.savePricing.mockRejectedValue(new Error("database unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const form = new URLSearchParams({ intent: "delete-images", publicIds: "edicut/packages/selected" });
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", "Could not verify the selected images or update package galleries, so no files were deleted. Refresh and try again.");
    expect(mocks.deleteImages).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("cleans up completed image uploads if another media-library upload fails", async () => {
    mocks.uploadImage
      .mockResolvedValueOnce({ public_id: "edicut/packages/complete", secure_url: "https://res.cloudinary.com/edicut/image/upload/complete.jpg", bytes: 3 })
      .mockRejectedValueOnce(new Error("provider unavailable"));
    const form = new FormData();
    form.set("intent", "upload-images");
    form.append("imageFiles", new File(["one"], "one.png", { type: "image/png" }));
    form.append("imageFiles", new File(["two"], "two.png", { type: "image/png" }));
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", expect.stringContaining("Successful uploads were removed"));
    expect(mocks.deleteImages).toHaveBeenCalledWith(["edicut/packages/complete"], {});
  });
  it("removes newly uploaded gallery images when package settings cannot be saved", async () => {
    mocks.pricingPackages.push({
      id: "creator-id", name: "Creator", slug: "creator", packageType: "monthly", editingHoursPerMonth: 88,
      editingHoursPerWorkday: 4, price: "$2,149", interval: "/month", description: "Creator package",
      features: ["Editing"], deliverables: [], galleryImages: [], bestFor: "Creators", turnaround: "Regular",
      revisions: "Included", badge: "", popular: false, active: true, sortOrder: 1,
    });
    mocks.savePricing.mockRejectedValueOnce(new Error("database unavailable"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const form = new FormData();
    for (const [key, value] of Object.entries({
      intent: "update-package", packageId: "creator-id", name: "Creator", slug: "creator", price: "$2,149",
      description: "Creator package", features: "Editing", deliverables: "Delivery", bestFor: "Creators",
      turnaround: "Regular", revisions: "Included", badge: "", sortOrder: "1",
    })) form.set(key, value);
    form.append("galleryImageFiles", new File(["png"], "gallery.png", { type: "image/png" }));
    const result = await action({ request: new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form }), context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error", expect.stringContaining("Newly uploaded gallery images were removed"));
    expect(mocks.deleteImages).toHaveBeenCalledWith(["edicut/packages/gallery.png"], {});
    spy.mockRestore();
  });
  it.each([["payments", "/site/node-logmin/subscriptions"], ["messages", "/dashboard/messages"], ["unknown", "/site/node-logmin"]])("redirects obsolete %s views to usable navigation", async (tab, path) => {
    try { await load(`?tab=${tab}`); throw new Error("Expected redirect"); }
    catch (error) { expect(error).toBeInstanceOf(Response); expect((error as Response).headers.get("Location")).toBe(path); }
  });
});
