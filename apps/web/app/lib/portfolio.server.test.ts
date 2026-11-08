import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSiteSetting: vi.fn() }));
vi.mock("./site-settings.server", () => ({ getSiteSetting: mocks.getSiteSetting }));

import { defaultPortfolioSections, getPortfolioSections, publicPortfolioSections } from "./portfolio.server";
import type { PortfolioSection, PortfolioVideo } from "./portfolio.server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSiteSetting.mockResolvedValue(undefined);
});

describe("portfolio settings reads", () => {
  it("uses demo defaults only when no setting has been saved", async () => {
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).resolves.toBe(defaultPortfolioSections);
  });

  it("rejects empty or malformed saved settings in strict admin mutations", async () => {
    mocks.getSiteSetting.mockResolvedValue("");
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).rejects.toThrow("empty");

    mocks.getSiteSetting.mockResolvedValue("not valid json");
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).rejects.toThrow();

    mocks.getSiteSetting.mockResolvedValue("[]");
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).rejects.toThrow("could not be read");

    mocks.getSiteSetting.mockResolvedValue(JSON.stringify([defaultPortfolioSections[0], { id: "broken" }]));
    await expect(getPortfolioSections(null, undefined, { failOnError: true })).rejects.toThrow("read safely");
  });

  it("keeps the public fallback behavior for empty saved settings", async () => {
    mocks.getSiteSetting.mockResolvedValue("");
    await expect(getPortfolioSections(null)).resolves.toBe(defaultPortfolioSections);
  });
});

describe("public portfolio categories", () => {
  const video = (id: string, tag: string): PortfolioVideo => ({
    id,
    title: id,
    creatorName: "Creator",
    tag,
    uniqueSellingPoint: "Sample",
    videoUrl: `https://www.youtube.com/watch?v=${id.padEnd(11, "x")}`,
    youtubeId: id.padEnd(11, "x"),
    videoProvider: "youtube",
    thumbnailUrl: "",
    orientation: "horizontal",
    sortOrder: 1,
  });

  const section = (slug: string, name: string, videos: PortfolioVideo[]): PortfolioSection => ({
    id: slug,
    name,
    slug,
    active: true,
    sortOrder: 1,
    videos,
  });

  it("filters standard category tabs by tag while keeping featured and custom sections curated", () => {
    const podcast = video("podcast001", "Podcast");
    const review = video("review00001", "Review");
    const healthAndBeauty = video("beauty00001", "Health & Beauty");
    const sections = publicPortfolioSections([
      section("featured", "Featured", [podcast, review]),
      section("podcast", "Podcast", [podcast, review]),
      section("health-and-beauty", "Health and Beauty", [healthAndBeauty, review]),
      section("studio-favorites", "Studio Favorites", [podcast, review]),
    ]);

    expect(sections.find((item) => item.slug === "featured")?.videos).toEqual([podcast, review]);
    expect(sections.find((item) => item.slug === "podcast")?.videos).toEqual([podcast]);
    expect(sections.find((item) => item.slug === "health-and-beauty")?.videos).toEqual([healthAndBeauty]);
    expect(sections.find((item) => item.slug === "studio-favorites")?.videos).toEqual([podcast, review]);
  });

  it.each(["ysz5S6PUM-U", "aqz-KE-bpKQ", "jNQXAC9IVRw", "M7lc1UVf-VE", "ScMzIvxBSi4"])(
    "replaces unusable saved reference %s with the verified public samples",
    (youtubeId) => {
      const invalidReference = video(youtubeId, "Commercial");
      const sections = publicPortfolioSections([section("featured", "Featured", [invalidReference])]);
      const publicVideos = sections.flatMap((item) => item.videos);

      expect(sections.find((item) => item.slug === "featured")?.videos.length).toBeGreaterThan(0);
      expect(publicVideos.map((item) => item.youtubeId)).not.toContain(youtubeId);
    },
  );
});
