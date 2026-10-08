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

  it("preserves existing image, icon, and fingerprinted asset routing", () => {
    expect(shouldServeStaticAsset("GET", "/images/portfolio/preview.webp")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/icons/brand/logo.svg")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/assets/why-hire-us-abc123.css")).toBe(true);
  });
});
