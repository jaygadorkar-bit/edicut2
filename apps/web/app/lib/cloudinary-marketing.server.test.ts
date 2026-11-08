import { afterEach, describe, expect, it, vi } from "vitest";
import { MARKETING_ASSET_CATEGORIES } from "./marketing-assets";
import { listCloudinaryMarketingImages, updateCloudinaryMarketingImage, uploadMarketingImageToCloudinary } from "./cloudinary.server";

const context = { cf: { env: {
  CLOUDINARY_CLOUD_NAME: "test-cloud",
  CLOUDINARY_API_KEY: "test-key",
  CLOUDINARY_API_SECRET: "test-secret",
} } };

afterEach(() => vi.unstubAllGlobals());

describe("marketing image uploads", () => {
  it("offers the supported social asset categories", () => {
    expect(MARKETING_ASSET_CATEGORIES).toEqual(["logo", "banner", "post", "story-reel", "thumbnail", "other"]);
  });

  it("rejects SVG files before reaching Cloudinary", async () => {
    const file = new File(["<svg></svg>"], "logo.svg", { type: "image/svg+xml" });
    await expect(uploadMarketingImageToCloudinary(file, "logo")).rejects.toThrow("Use a JPG, PNG, WebP, AVIF, or GIF image.");
  });

  it("rejects unknown asset categories before reaching Cloudinary", async () => {
    const file = new File(["image"], "post.png", { type: "image/png" });
    await expect(uploadMarketingImageToCloudinary(file, "untrusted" as never)).rejects.toThrow("Choose a valid marketing asset type.");
  });

  it("stores an initial readable title and type with new uploads", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({
      public_id: "edicut/marketing/logo/brand-mark",
      secure_url: "https://res.cloudinary.com/test-cloud/image/upload/brand-mark.png",
      bytes: 5,
    }));
    vi.stubGlobal("fetch", fetch);
    const file = new File(["image"], "brand_mark.final.png", { type: "image/png" });

    const asset = await uploadMarketingImageToCloudinary(file, "logo", context);
    const [, options] = fetch.mock.calls[0];
    const requestBody = options.body as FormData;

    expect(requestBody.get("context")).toBe("marketing_title=brand mark.final|marketing_category=logo");
    expect(asset.context?.custom).toEqual({ marketing_title: "brand mark.final", marketing_category: "logo" });
  });

  it("lists contextual metadata so edits survive reloads", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ resources: [{
      public_id: "edicut/marketing/logo/brand-mark",
      secure_url: "https://res.cloudinary.com/test-cloud/image/upload/brand-mark.png",
      bytes: 5,
      context: { custom: { marketing_title: "Brand mark", marketing_category: "logo" } },
    }] }));
    vi.stubGlobal("fetch", fetch);

    const assets = await listCloudinaryMarketingImages(context);
    expect(String(fetch.mock.calls[0][0])).toContain("context=true");
    expect(assets[0].context?.custom?.marketing_title).toBe("Brand mark");
  });

  it("updates only allow-listed marketing assets and safely encodes title metadata", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ public_id: "edicut/marketing/post/brand" }));
    vi.stubGlobal("fetch", fetch);

    await updateCloudinaryMarketingImage("edicut/marketing/logo/brand mark", "Brand | story = final", "post", context);

    const [url, options] = fetch.mock.calls[0];
    const params = new URLSearchParams(options.body as URLSearchParams);
    expect(url).toContain("/resources/image/upload/edicut/marketing/logo/brand%20mark");
    expect(options.method).toBe("POST");
    expect(params.get("context")).toBe("marketing_title=Brand \\| story \\= final|marketing_category=post");
  });

  it("rejects invalid metadata and assets outside the marketing folder before contacting Cloudinary", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(updateCloudinaryMarketingImage("edicut/packages/cover", "Title", "logo", context)).rejects.toThrow("Only marketing library images can be updated.");
    await expect(updateCloudinaryMarketingImage("edicut/marketing/logo/mark", " ", "logo", context)).rejects.toThrow("Enter a title between 1 and 120 characters.");
    await expect(updateCloudinaryMarketingImage("edicut/marketing/logo/mark", "Title", "unknown" as never, context)).rejects.toThrow("Choose a valid marketing asset type.");
    expect(fetch).not.toHaveBeenCalled();
  });
});
