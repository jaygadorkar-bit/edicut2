import { describe, expect, it } from "vitest";
import { defaultPortfolioSections } from "./portfolio-demo";
import { wrapLoopPosition } from "./portfolio-loop";

describe("portfolio loop boundaries", () => {
  it("preserves movement across either end, including multiple laps", () => {
    expect(wrapLoopPosition(995 + 30, 1000)).toBe(25);
    expect(wrapLoopPosition(5 - 30, 1000)).toBe(975);
    expect(wrapLoopPosition(1000, 1000)).toBe(0);
    expect(wrapLoopPosition(3025, 1000)).toBe(25);
    expect(wrapLoopPosition(-3025, 1000)).toBe(975);
  });

  it("handles fractional movement and unmeasured tracks", () => {
    expect(wrapLoopPosition(-0.5, 1000)).toBe(999.5);
    expect(wrapLoopPosition(50, 0)).toBe(0);
  });
});

describe("portfolio category content", () => {
  it.each(defaultPortfolioSections)("has at least six distinct videos in $name", (section) => {
    expect(section.videos.length).toBeGreaterThanOrEqual(6);
    expect(new Set(section.videos.map((video) => video.youtubeId)).size).toBe(section.videos.length);
  });
});
