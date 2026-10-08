import { describe, expect, it } from "vitest";
import { monthlyAddOnQuoteHref, monthlyAddOnQuotePrefill, packageAddOnQuery, packageAddOnTotal, parsePackageAddOns, savedPackageAddOns, selectedPackageAddOns, withoutIncludedThumbnails } from "./package-addons";
import { SINGLE_VIDEO_PACKAGES, SUBSCRIPTION_PACKAGES, getCheckoutUrl } from "./subscriptions";

describe("optional package add-ons", () => {
  it.each(SINGLE_VIDEO_PACKAGES)("offers both $20 extras with $name without including a thumbnail", pack => {
    expect([...pack.features, ...pack.deliverables].join(" ")).not.toMatch(/thumbnail/i);
    const addOns = parsePackageAddOns(["short-form", "thumbnail"], pack.packageType)!;
    expect(packageAddOnTotal(addOns)).toBe(4000);
    expect(getCheckoutUrl(pack, { addOns: addOns.map(item => item.id), affiliateCode: "partner-1" })).toBe(`/checkout/${pack.slug}?addon=thumbnail&addon=short-form&ref=PARTNER-1`);
  });
  it.each(SUBSCRIPTION_PACKAGES)("excludes per-video charges from $name monthly checkout", pack => {
    expect(selectedPackageAddOns(["thumbnail", "short-form"], pack.packageType)).toEqual([]);
    expect(parsePackageAddOns(["thumbnail"], pack.packageType)).toBeNull();
    expect(parsePackageAddOns(["short-form"], pack.packageType)).toBeNull();
    expect(parsePackageAddOns([], pack.packageType)).toEqual([]);
    expect(getCheckoutUrl(pack, { addOns: ["thumbnail", "short-form"], affiliateCode: "partner-1" })).toBe(`/checkout/${pack.slug}?ref=PARTNER-1`);
  });
  it.each([["unknown"], ["thumbnail", "thumbnail"], ["thumbnail", "short-form", "thumbnail"], [123]])("rejects invalid or duplicate submitted IDs: %j", (...values) => {
    expect(parsePackageAddOns(values, "single")).toBeNull();
  });
  it("allows no extras and removes previous selections from the query", () => {
    expect(parsePackageAddOns([], "single")).toEqual([]);
    expect(packageAddOnQuery([], "single", new URLSearchParams("addon=thumbnail&ref=PARTNER")).toString()).toBe("ref=PARTNER");
  });
  it("prefills monthly quote requests using known package and extra details", () => {
    expect(monthlyAddOnQuoteHref("creator-plus", "thumbnail-bundle")).toBe("/custom-quote?package=creator-plus&monthly-addon=thumbnail-bundle");
    expect(monthlyAddOnQuotePrefill(SUBSCRIPTION_PACKAGES[1], "thumbnail-bundle")).toMatchObject({
      title: "Growth: Monthly thumbnail bundle", requestType: "recurring", cadence: "monthly", services: ["thumbnails"],
      brief: expect.stringContaining("110 editing hours per month"),
    });
    expect(monthlyAddOnQuotePrefill(SUBSCRIPTION_PACKAGES[0], "extra-editing-hours")?.services).toEqual(["cuts"]);
    expect(monthlyAddOnQuotePrefill(SINGLE_VIDEO_PACKAGES[0], "thumbnail-bundle")).toBeNull();
    expect(monthlyAddOnQuotePrefill(SUBSCRIPTION_PACKAGES[0], "unknown")).toBeNull();
  });
  it("retains saved prices independently from today's catalog and ignores malformed snapshots", () => {
    expect(savedPackageAddOns([{ id: "thumbnail", label: "Custom thumbnail", amountCents: 1700 }, { id: "unknown", label: "Invalid", amountCents: 1 }, { id: "short-form", label: "Invalid", amountCents: -1 }])).toEqual([{ id: "thumbnail", label: "Custom thumbnail", amountCents: 1700 }]);
    expect(savedPackageAddOns(undefined)).toEqual([]);
  });
  it("removes legacy thumbnails while preserving combined motion and unrelated custom benefits", () => {
    expect(withoutIncludedThumbnails(["1 custom thumbnail", "One custom thumbnail and light template-based branded motion", "Custom sound design", "Color grading and one custom thumbnail", "One custom thumbnail and sound design"])).toEqual(["Light template-based branded motion", "Custom sound design", "Color grading", "Sound design"]);
  });
});
