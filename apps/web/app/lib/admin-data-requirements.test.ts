import { describe, expect, it } from "vitest";
import { getAdminDataRequirements, getPageWithinRange, getPositivePage } from "./admin-data-requirements";

describe("getAdminDataRequirements", () => {
  it("loads only dashboard metrics and summary data for the overview", () => {
    expect(getAdminDataRequirements("overview")).toEqual({
      userDirectory: false,
      stats: true,
      pricingPackages: true,
      siteSettings: false,
      roleFeatureAccess: false,
      portfolioSections: false,
      images: true,
      imageUsage: false,
      videos: false,
      videoUsage: false,
    });
  });

  it("loads user records and metrics only on the users tab", () => {
    expect(getAdminDataRequirements("users")).toMatchObject({ userDirectory: true, stats: true, images: false, videos: false });
  });

  it.each([
    ["packages", { pricingPackages: true }],
    ["images", { images: true, imageUsage: true }],
    ["videos", { videos: true, videoUsage: true, portfolioSections: true }],
    ["roles", { roleFeatureAccess: true }],
    ["settings", { siteSettings: true }],
  ])("loads tab data only for %s", (tab, expected) => {
    expect(getAdminDataRequirements(tab)).toMatchObject(expected);
  });

  it("avoids heavyweight lookups for project and unknown tabs", () => {
    for (const tab of ["projects", "payments", "audit", "unknown"]) {
      expect(Object.values(getAdminDataRequirements(tab)).every((required) => !required)).toBe(true);
    }
  });
});

describe("getPositivePage", () => {
  it.each([
    [null, 1],
    ["", 1],
    ["not-a-page", 1],
    ["0", 1],
    ["-3", 1],
    ["1.5", 1],
    ["4", 4],
  ] as const)("normalizes %s to page %i", (value, expected) => {
    expect(getPositivePage(value)).toBe(expected);
  });
});

describe("getPageWithinRange", () => {
  it.each([
    [1, 4, 1],
    [4, 4, 4],
    [5, 4, 4],
    [Number.MAX_SAFE_INTEGER, 4, 4],
    [0, 4, 1],
    [2, 0, 1],
  ])("clamps page %i to a valid range ending at %i", (requestedPage, pageCount, expected) => {
    expect(getPageWithinRange(requestedPage, pageCount)).toBe(expected);
  });
});
