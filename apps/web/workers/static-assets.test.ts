import { describe, expect, it } from "vitest";
import { BLOG_HERO_FILM } from "../app/lib/blog-hero";
import { shouldServeStaticAsset, shouldServeStaticPublicPage } from "./static-assets";

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

  it("serves the blog film, audio fallback, poster, and captions through the asset binding", () => {
    for (const path of [BLOG_HERO_FILM.videoSrc, BLOG_HERO_FILM.audioSrc, BLOG_HERO_FILM.posterSrc, BLOG_HERO_FILM.captionsSrc]) {
      expect(shouldServeStaticAsset("GET", path)).toBe(true);
      expect(shouldServeStaticAsset("HEAD", path)).toBe(true);
      expect(shouldServeStaticAsset("POST", path)).toBe(false);
    }
    expect(shouldServeStaticAsset("GET", "/media/blog/private.json")).toBe(false);
    expect(shouldServeStaticAsset("GET", "/media/other/file.mp4")).toBe(false);
  });

  it("serves public artwork, fonts, images, icons, and fingerprinted assets", () => {
    expect(shouldServeStaticAsset("GET", "/artwork/why-hire-us/creator.svg")).toBe(true);
    expect(shouldServeStaticAsset("HEAD", "/artwork/why-hire-us/manager.svg")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/fonts/dm-sans-latin-normal.woff2")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/images/portfolio/preview.webp")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/icons/brand/logo.svg")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/assets/why-hire-us-abc123.css")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/favicon.ico")).toBe(true);
    expect(shouldServeStaticAsset("HEAD", "/favicon.ico")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/favicon.svg")).toBe(true);
    expect(shouldServeStaticAsset("HEAD", "/favicon.svg")).toBe(true);
    expect(shouldServeStaticAsset("GET", "/favicon.png")).toBe(true);
  });

  it("routes public HTML pages through the Worker before serving their prerendered asset", () => {
    expect(shouldServeStaticPublicPage("GET", "/")).toBe(true);
    expect(shouldServeStaticPublicPage("HEAD", "/services/youtube-video-editing/")).toBe(true);
    expect(shouldServeStaticPublicPage("GET", "/pricing/creator-pro")).toBe(true);
    expect(shouldServeStaticPublicPage("GET", "/about")).toBe(false);
    expect(shouldServeStaticPublicPage("GET", "/dashboard")).toBe(false);
    expect(shouldServeStaticPublicPage("POST", "/")).toBe(false);
  });
});
