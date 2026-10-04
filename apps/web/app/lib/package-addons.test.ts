import { describe, expect, it } from "vitest";
import { packageAddOnQuery, packageAddOnTotal, parsePackageAddOns, savedPackageAddOns, withoutIncludedThumbnails } from "./package-addons";
import { ALL_EDITING_PACKAGES, getCheckoutUrl } from "./subscriptions";

describe("optional package add-ons", () => {
  it.each(ALL_EDITING_PACKAGES)("offers both $20 extras with $name without including a thumbnail", pack => {
    expect([...pack.features, ...pack.deliverables].join(" ")).not.toMatch(/thumbnail/i);
    const addOns = parsePackageAddOns(["short-form", "thumbnail"])!;
    expect(packageAddOnTotal(addOns)).toBe(4000);
    expect(getCheckoutUrl(pack, { addOns: addOns.map(item => item.id), affiliateCode: "partner-1" })).toBe(`/checkout/${pack.slug}?addon=thumbnail&addon=short-form&ref=PARTNER-1`);
  });
  it.each([["unknown"], ["thumbnail", "thumbnail"], ["thumbnail", "short-form", "thumbnail"], [123]])("rejects invalid or duplicate submitted IDs: %j", (...values) => {
    expect(parsePackageAddOns(values)).toBeNull();
  });
  it("allows no extras and removes previous selections from the query", () => {
    expect(parsePackageAddOns([])).toEqual([]);
    expect(packageAddOnQuery([], new URLSearchParams("addon=thumbnail&ref=PARTNER")).toString()).toBe("ref=PARTNER");
  });
  it("retains saved prices independently from today's catalog and ignores malformed snapshots", () => {
    expect(savedPackageAddOns([{ id: "thumbnail", label: "Custom thumbnail", amountCents: 1700 }, { id: "unknown", label: "Invalid", amountCents: 1 }, { id: "short-form", label: "Invalid", amountCents: -1 }])).toEqual([{ id: "thumbnail", label: "Custom thumbnail", amountCents: 1700 }]);
    expect(savedPackageAddOns(undefined)).toEqual([]);
  });
  it("removes legacy thumbnails while preserving combined motion and unrelated custom benefits", () => {
    expect(withoutIncludedThumbnails(["1 custom thumbnail", "One custom thumbnail and light template-based branded motion", "Custom sound design", "Color grading and one custom thumbnail", "One custom thumbnail and sound design"])).toEqual(["Light template-based branded motion", "Custom sound design", "Color grading", "Sound design"]);
  });
});
