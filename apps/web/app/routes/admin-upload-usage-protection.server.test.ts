import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const adminSession = { get: vi.fn(() => "admin-42") };
  return {
    adminSession,
    findAdminUserById: vi.fn(async () => ({ id: "admin-42", active: true, role: "admin" })),
    getAdminSession: vi.fn(async () => adminSession),
    getDbFromContext: vi.fn(() => ({})),
    requireAdminUser: vi.fn(async () => ({ id: "admin-42", active: true, role: "admin" })),
    uploadPackageImageToCloudinary: vi.fn(async () => ({ public_id: "image-1", secure_url: "https://example.com/image.png", bytes: 1 })),
  };
});

vi.mock("@edicut/db/repositories/admin-users", async (importOriginal) => ({
  ...await importOriginal<typeof import("@edicut/db/repositories/admin-users")>(),
  findAdminUserById: mocks.findAdminUserById,
}));
vi.mock("../lib/db.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/db.server")>(),
  getDbFromContext: mocks.getDbFromContext,
}));
vi.mock("../lib/session.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/session.server")>(),
  getAdminSession: mocks.getAdminSession,
  requireAdminUser: mocks.requireAdminUser,
}));
vi.mock("../lib/cloudinary.server", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/cloudinary.server")>(),
  uploadPackageImageToCloudinary: mocks.uploadPackageImageToCloudinary,
}));

import { action } from "./admin";

beforeEach(() => vi.clearAllMocks());

describe("admin Cloudinary upload usage protection", () => {
  it("stops uploads before Cloudinary after two requests in a minute", async () => {
    const uploadCounts = new Map<string, number>();
    const uploadLimit = vi.fn(async ({ key }: { key: string }) => {
      const count = (uploadCounts.get(key) ?? 0) + 1;
      uploadCounts.set(key, count);
      return { success: count <= 2 };
    });
    const pass = vi.fn(async () => ({ success: true }));
    const context = {
      cf: {
        env: {
          USER_ACTION_LIMITER: { limit: pass },
          ADMIN_MULTIPART_LIMITER: { limit: pass },
          CLOUDINARY_UPLOAD_LIMITER: { limit: uploadLimit },
        },
      },
    };
    const results: Array<{ success?: string; error?: string }> = [];

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const form = new FormData();
      form.set("intent", "upload-images");
      form.set("imageFiles", new File(["x"], "image.png", { type: "image/png" }));
      const request = new Request("http://localhost:3002/site/node-logmin", { method: "POST", body: form });
      results.push(await action({ request, context, params: {} } as Parameters<typeof action>[0]) as { success?: string; error?: string });
    }

    expect(uploadLimit).toHaveBeenCalledTimes(3);
    expect(uploadLimit.mock.calls.map(([input]) => input.key)).toEqual([
      "admin:admin-42",
      "admin:admin-42",
      "admin:admin-42",
    ]);
    expect(results.slice(0, 2).every((result) => result.success === "Uploaded 1 image.")).toBe(true);
    expect(results[2].error).toContain("two requests per minute");
    expect(mocks.uploadPackageImageToCloudinary).toHaveBeenCalledTimes(2);
  });
});
