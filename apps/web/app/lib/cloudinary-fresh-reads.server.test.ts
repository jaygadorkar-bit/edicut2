import { afterEach, describe, expect, it, vi } from "vitest";
import { countCloudinaryImages, getCloudinaryUsage, getCloudinaryVideoUsage, listCloudinaryImages, listCloudinaryVideos } from "./cloudinary.server";

const context = { cf: { env: {
  CLOUDINARY_CLOUD_NAME: "test-images", CLOUDINARY_API_KEY: "test-image-key", CLOUDINARY_API_SECRET: "test-image-secret",
  CLOUDINARY_VIDEO_CLOUD_NAME: "test-videos", CLOUDINARY_VIDEO_API_KEY: "test-video-key", CLOUDINARY_VIDEO_API_SECRET: "test-video-secret",
} } };
afterEach(() => vi.unstubAllGlobals());

describe("uncached Cloudinary admin reads", () => {
  it.each([listCloudinaryImages, listCloudinaryVideos, getCloudinaryUsage, getCloudinaryVideoUsage])("reads updated data on every call: %s", async read => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ resources: [{ public_id: "old" }], credits: { usage: 1 } }))
      .mockResolvedValueOnce(Response.json({ resources: [{ public_id: "new" }], credits: { usage: 2 } }));
    vi.stubGlobal("fetch", fetch);
    const first = await read(context), second = await read(context);
    expect(second).not.toEqual(first); expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of fetch.mock.calls) expect(options.cache).toBe("no-store");
  });
  it("requests a scalar overview count with at most one asset", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ total_count: 350, resources: [{ public_id: "one" }] })); vi.stubGlobal("fetch", fetch);
    expect(await countCloudinaryImages(context)).toBe(350);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("https://api.cloudinary.com/v1_1/test-images/resources/search");
    expect(JSON.parse(options.body)).toEqual({ expression: "resource_type:image AND type:upload AND public_id:edicut/*", max_results: 1 });
    expect(options.cache).toBe("no-store");
  });
  it("does not substitute an old success when a later read fails", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ credits: { usage: 1 } })).mockResolvedValueOnce(Response.json({ error: { message: "Provider unavailable" } }, { status: 503 }));
    vi.stubGlobal("fetch", fetch); await getCloudinaryUsage(context);
    await expect(getCloudinaryUsage(context)).rejects.toThrow("Provider unavailable");
  });
  it("rejects invalid counts rather than showing a misleading zero", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ total_count: -1 })));
    await expect(countCloudinaryImages(context)).rejects.toThrow("count unavailable");
  });
});
