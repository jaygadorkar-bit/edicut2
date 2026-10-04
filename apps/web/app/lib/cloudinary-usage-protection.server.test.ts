import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteCloudinaryImages,
  deleteCloudinaryVideos,
  uploadPackageImageToCloudinary,
  uploadPortfolioVideoToCloudinary,
} from "./cloudinary.server";

afterEach(() => vi.unstubAllGlobals());

describe("Cloudinary usage guardrails", () => {
  it("rejects images above 10 MB before contacting Cloudinary", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const oversizedFile = { type: "image/png", size: 10 * 1024 * 1024 + 1 } as File;
    const context = {
      cf: {
        env: {
          CLOUDINARY_CLOUD_NAME: "test-cloud",
          CLOUDINARY_API_KEY: "test-key",
          CLOUDINARY_API_SECRET: "test-secret",
        },
      },
    };

    await expect(uploadPackageImageToCloudinary(oversizedFile, context)).rejects.toThrow("limited to 10 MB");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects videos above 50 MB before contacting Cloudinary", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const oversizedFile = { type: "video/mp4", size: 50 * 1024 * 1024 + 1 } as File;
    const context = {
      cf: {
        env: {
          CLOUDINARY_VIDEO_CLOUD_NAME: "test-cloud",
          CLOUDINARY_VIDEO_API_KEY: "test-key",
          CLOUDINARY_VIDEO_API_SECRET: "test-secret",
        },
      },
    };

    await expect(uploadPortfolioVideoToCloudinary(oversizedFile, context)).rejects.toThrow("limited to 50 MB");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversized bulk image and video deletions before credentials or network access", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const ids = Array.from({ length: 101 }, (_, index) => `asset-${index}`);

    await expect(deleteCloudinaryImages(ids)).rejects.toThrow("limited to 100 images");
    await expect(deleteCloudinaryVideos(ids)).rejects.toThrow("limited to 100 videos");
    expect(fetch).not.toHaveBeenCalled();
  });
});
