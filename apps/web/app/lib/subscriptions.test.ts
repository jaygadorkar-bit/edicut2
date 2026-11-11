import { describe, expect, it } from "vitest";
import { ALL_EDITING_PACKAGES, getFinishedLengthLimitSeconds, getPackageIndex, getCheckoutUrl, getProjectFulfillmentPackage, parsePackagePrice, REQUIRED_PACKAGE_STAFFING, SHORT_FORM_PACKAGE_SLUG, SINGLE_VIDEO_PACKAGES, SUBSCRIPTION_PACKAGES } from "./subscriptions";

describe("editing package catalog", () => {
  it("contains three one-time video edits and three monthly packages", () => {
    expect(ALL_EDITING_PACKAGES).toHaveLength(6);
    expect(SINGLE_VIDEO_PACKAGES).toHaveLength(3);
    expect(SUBSCRIPTION_PACKAGES).toHaveLength(3);
    expect(SUBSCRIPTION_PACKAGES.map((item) => item.name)).toEqual(["Essential", "Pro", "Max"]);
    expect(new Set(ALL_EDITING_PACKAGES.map((item) => item.slug)).size).toBe(6);
    expect(SUBSCRIPTION_PACKAGES.map((item) => [item.editingHoursPerMonth, item.editingHoursPerWorkday, item.revisionRounds])).toEqual([[88, 4, 2], [110, 5, 2], [110, 5, 2]]);
    expect(ALL_EDITING_PACKAGES.every((item) => item.revisionRounds >= 2)).toBe(true);
    expect(ALL_EDITING_PACKAGES.map((item) => item.basePrice)).toEqual([2149, 2649, 3149, 25, 109, 249]);
    expect(SINGLE_VIDEO_PACKAGES.map((item) => item.slug)).toEqual([SHORT_FORM_PACKAGE_SLUG, "single-creator", "single-feature"]);
    expect(SINGLE_VIDEO_PACKAGES[0]).toMatchObject({ name: "Short-form Video", finishedLength: "Up to 60 seconds", maxFinishedSeconds: 60, rawFootageLimit: "Up to 15 minutes", revisionRounds: 2, basePrice: 25 });
    expect(getFinishedLengthLimitSeconds(SINGLE_VIDEO_PACKAGES[0]!)).toBe(60);
    expect(getFinishedLengthLimitSeconds(SINGLE_VIDEO_PACKAGES[1]!)).toBe(8 * 60);
    expect(getProjectFulfillmentPackage("single-studio")).toMatchObject({ name: "Studio Video", basePrice: 179, maxFinishedSeconds: 900 });
    expect(SINGLE_VIDEO_PACKAGES[2]).toMatchObject({ name: "Feature Video", finishedLength: "Up to 30 minutes", rawFootageLimit: "Up to 240 minutes", revisionRounds: 3, basePrice: 249 });
  });

  it("includes a personal project manager and two dedicated editors in every offer", () => {
    for (const pack of ALL_EDITING_PACKAGES) {
      expect(pack.features).toEqual(expect.arrayContaining([...REQUIRED_PACKAGE_STAFFING]));
      expect(pack.deliverables).toEqual(expect.arrayContaining([...REQUIRED_PACKAGE_STAFFING]));
      expect(pack.revisionRounds).toBeGreaterThanOrEqual(2);
    }
  });

  it("parses whole-dollar package prices without accepting malformed grouping", () => {
    expect(parsePackagePrice("$1,549")).toBe(1549);
    expect(parsePackagePrice("109")).toBe(109);
    expect(parsePackagePrice("1,,549")).toBeNull();
    expect(parsePackagePrice("$12.50")).toBeNull();
  });
});

describe("getPackageIndex", () => {
  it("uses the current active package ordering", () => {
    const packages = [{ slug: "creator-pro" }, { slug: "creator" }, { slug: "creator-plus" }];

    expect(getPackageIndex("creator-pro", packages)).toBe(0);
    expect(getPackageIndex("creator", packages)).toBe(1);
  });

  it("returns -1 for an unknown package instead of selecting the first package", () => {
    expect(getPackageIndex("not-a-package", [{ slug: "creator" }])).toBe(-1);
  });
});

describe("getCheckoutUrl affiliate attribution", () => {
  it("preserves a normalized affiliate code and selected coverage", () => {
    expect(getCheckoutUrl(SUBSCRIPTION_PACKAGES[0], {
      runtime: true,
      affiliateCode: "  jay-ga  ",
    })).toBe("/checkout/creator?runtime=1&ref=JAY-GA");
  });

  it("ignores invalid affiliate codes", () => {
    expect(getCheckoutUrl(SUBSCRIPTION_PACKAGES[0], { affiliateCode: "bad code" })).toBe("/checkout/creator");
  });
});
