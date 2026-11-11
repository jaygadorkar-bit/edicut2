import { describe, expect, it } from "vitest";
import { MONTHLY_PACKAGE_ADD_ONS, monthlyAddOnQuoteHref, monthlyAddOnQuotePrefill, packageAddOnQuery, packageAddOnTotal, parsePackageAddOns, savedPackageAddOns, selectedPackageAddOns, withoutIncludedThumbnails } from "./package-addons";
import { ALL_EDITING_PACKAGES, SHORT_FORM_PACKAGE_SLUG, SINGLE_VIDEO_PACKAGES, SUBSCRIPTION_PACKAGES, getCheckoutUrl } from "./subscriptions";

describe("optional package add-ons", () => {
  it.each(ALL_EDITING_PACKAGES)("includes a custom thumbnail with $name", pack => {
    expect(pack.features).toContain("One custom thumbnail included with each video edit");
    expect(pack.deliverables).toContain("One custom thumbnail included with each video edit");
    expect(parsePackageAddOns(["thumbnail"], pack.packageType, pack.slug)).toBeNull();
  });

  it.each(SINGLE_VIDEO_PACKAGES.filter(pack => pack.slug !== SHORT_FORM_PACKAGE_SLUG))("offers the $20 short-form extra with $name", pack => {
    const addOns = parsePackageAddOns(["short-form"], pack.packageType, pack.slug)!;
    expect(packageAddOnTotal(addOns)).toBe(2000);
    expect(getCheckoutUrl(pack, { addOns: addOns.map(item => item.id), affiliateCode: "partner-1" })).toBe(`/checkout/${pack.slug}?addon=short-form&ref=PARTNER-1`);
  });

  it("does not offer per-video extras on the short-form package", () => {
    const pack = SINGLE_VIDEO_PACKAGES[0]!;
    expect(pack.slug).toBe(SHORT_FORM_PACKAGE_SLUG);
    expect(parsePackageAddOns(["short-form"], "single", pack.slug)).toBeNull();
    expect(parsePackageAddOns(["thumbnail"], "single", pack.slug)).toBeNull();
    expect(selectedPackageAddOns(["short-form", "thumbnail"], "single", pack.slug)).toEqual([]);
    expect(getCheckoutUrl(pack, { addOns: ["short-form", "thumbnail"], affiliateCode: "partner-1" })).toBe(`/checkout/${pack.slug}?ref=PARTNER-1`);
  });

  it.each(SUBSCRIPTION_PACKAGES)("excludes per-video add-ons from $name monthly checkout", pack => {
    expect(selectedPackageAddOns(["thumbnail", "short-form"], pack.packageType)).toEqual([]);
    expect(parsePackageAddOns(["thumbnail"], pack.packageType)).toBeNull();
    expect(parsePackageAddOns(["short-form"], pack.packageType)).toBeNull();
    expect(parsePackageAddOns([], pack.packageType)).toEqual([]);
    expect(getCheckoutUrl(pack, { addOns: ["thumbnail", "short-form"], affiliateCode: "partner-1" })).toBe(`/checkout/${pack.slug}?ref=PARTNER-1`);
  });

  it.each([["unknown"], ["thumbnail"], ["thumbnail", "thumbnail"], ["short-form", "short-form"], [123]])("rejects invalid or duplicate submitted IDs: %j", (...values) => {
    expect(parsePackageAddOns(values, "single")).toBeNull();
  });

  it("allows no extras and removes retired thumbnail selections from the query", () => {
    expect(parsePackageAddOns([], "single")).toEqual([]);
    expect(packageAddOnQuery([], "single", new URLSearchParams("addon=thumbnail&ref=PARTNER")).toString()).toBe("ref=PARTNER");
    expect(packageAddOnQuery(["thumbnail"], "single").toString()).toBe("");
  });

  it("keeps only extra editing hours as a monthly package quote extra", () => {
    expect(MONTHLY_PACKAGE_ADD_ONS.map(item => item.id)).toEqual(["extra-editing-hours"]);
    expect(monthlyAddOnQuoteHref("creator-plus", "extra-editing-hours")).toBe("/custom-quote?package=creator-plus&monthly-addon=extra-editing-hours");
    expect(monthlyAddOnQuotePrefill(SUBSCRIPTION_PACKAGES[1], "extra-editing-hours")).toMatchObject({
      title: "Pro: Extra editing hours", requestType: "recurring", cadence: "monthly", services: ["cuts"],
      brief: expect.stringContaining("110 editing hours per month"),
    });
    expect(monthlyAddOnQuotePrefill(SUBSCRIPTION_PACKAGES[1], "thumbnail-bundle")).toBeNull();
    expect(monthlyAddOnQuotePrefill(SINGLE_VIDEO_PACKAGES[0], "extra-editing-hours")).toBeNull();
  });

  it("keeps legacy thumbnail snapshots for existing purchases but rejects new ones", () => {
    expect(savedPackageAddOns([
      { id: "thumbnail", label: "Custom thumbnail", amountCents: 1700 },
      { id: "unknown", label: "Invalid", amountCents: 1 },
      { id: "short-form", label: "Invalid", amountCents: -1 },
    ])).toEqual([{ id: "thumbnail", label: "Custom thumbnail", amountCents: 1700 }]);
    expect(savedPackageAddOns(undefined)).toEqual([]);
    expect(parsePackageAddOns(["thumbnail"], "single")).toBeNull();
  });

  it("removes legacy thumbnail text while preserving other benefits", () => {
    expect(withoutIncludedThumbnails(["1 custom thumbnail", "One custom thumbnail and light template-based branded motion", "Custom sound design", "Color grading and one custom thumbnail", "One custom thumbnail and sound design"])).toEqual(["Light template-based branded motion", "Custom sound design", "Color grading", "Sound design"]);
  });
});
