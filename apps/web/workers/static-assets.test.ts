import { describe, expect, it } from "vitest";
import { shouldServeStaticAsset } from "./static-assets";

describe("Worker static asset routing", () => {
  it("serves the public narrated hero audio through the asset binding", () => {
    const audioPath = "/audio/why-hire-us/edicut-why-hire-us-mix.wav";

    expect(shouldServeStaticAsset("GET", audioPath)).toBe(true);
    expect(shouldServeStaticAsset("HEAD", audioPath)).toBe(true);
  });

  it("keeps non-asset and non-read requests out of the asset binding", () => {
    expect(shouldServeStaticAsset("POST", "/audio/why-hire-us/mix.wav")).toBe(false);
    expect(shouldServeStaticAsset("GET", "/dashboard/projects")).toBe(false);
  });

  it("serves public artwork, fonts, images, icons, and fingerprinted assets", () => {
    expect(shouldServeStaticAsset("GET", "/artwork/why-hire-us/creator.svg")).toBe(true);
    expect(shouldServeStaticAsset("HEAD", "/artwork/why-hire-us/manager.svg")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/fonts/dm-sans-latin-normal.woff2")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/images/portfolio/preview.webp")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/icons/brand/logo.svg")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/assets/why-hire-us-abc123.css")).toBe(true);
  });
});
