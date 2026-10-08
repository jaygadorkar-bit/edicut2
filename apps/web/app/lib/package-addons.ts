import type { CustomQuoteInput } from "@edicut/shared/contracts/custom-quotes";
import type { EditingPackage } from "./subscriptions";

export const PACKAGE_ADD_ONS = [
  { id: "thumbnail", label: "Custom thumbnail", description: "One thumbnail designed for your video.", amountCents: 2000 },
  { id: "short-form", label: "Short-form video", description: "One vertical cut from your supplied footage.", amountCents: 2000 },
] as const;

export type PackageAddOnId = typeof PACKAGE_ADD_ONS[number]["id"];
export type PackageAddOn = { id: PackageAddOnId; label: string; amountCents: number };

export const MONTHLY_PACKAGE_ADD_ONS = [
  { id: "extra-editing-hours", label: "Extra editing hours", description: "More reserved editing time for a busier month.", service: "cuts" },
  { id: "thumbnail-bundle", label: "Monthly thumbnail bundle", description: "A set of thumbnails for your monthly publishing schedule.", service: "thumbnails" },
] as const;
export type MonthlyPackageAddOnId = typeof MONTHLY_PACKAGE_ADD_ONS[number]["id"];
export type MonthlyAddOnQuotePrefill = Pick<CustomQuoteInput, "title" | "brief" | "requestType" | "cadence" | "services">;

export function packageAddOnsFor(packageType: EditingPackage["packageType"]) {
  return packageType === "single" ? PACKAGE_ADD_ONS : [];
}

export function monthlyAddOnQuoteHref(packageSlug: string, id: MonthlyPackageAddOnId) {
  return `/custom-quote?${new URLSearchParams({ package: packageSlug, "monthly-addon": id })}`;
}

export function monthlyAddOnQuotePrefill(pack: EditingPackage, id: string): MonthlyAddOnQuotePrefill | null {
  if (pack.packageType !== "monthly") return null;
  const item = MONTHLY_PACKAGE_ADD_ONS.find(option => option.id === id);
  if (!item) return null;
  return {
    title: `${pack.name}: ${item.label}`.slice(0, 120),
    brief: `I'd like ${item.label.toLowerCase()} for my ${pack.name} monthly package (${pack.editingHoursPerMonth} editing hours per month). Please confirm the quantity, scope, availability, and price before work begins.`,
    requestType: "recurring", cadence: "monthly", services: [item.service],
  };
}

// Prices and labels always come from the catalog, never from submitted fields.
export function selectedPackageAddOns(ids: readonly string[], packageType: EditingPackage["packageType"]): PackageAddOn[] {
  return packageAddOnsFor(packageType).filter(item => ids.includes(item.id)).map(({ id, label, amountCents }) => ({ id, label, amountCents }));
}

export function parsePackageAddOns(values: readonly unknown[], packageType: EditingPackage["packageType"]): PackageAddOn[] | null {
  const options = packageAddOnsFor(packageType);
  if (values.length > options.length || values.some(value => typeof value !== "string" || !options.some(item => item.id === value))) return null;
  if (new Set(values).size !== values.length) return null;
  return selectedPackageAddOns(values as string[], packageType);
}

export function packageAddOnTotal(addOns: readonly PackageAddOn[]) {
  return addOns.reduce((total, item) => total + item.amountCents, 0);
}

export function packageAddOnQuery(ids: readonly string[], packageType: EditingPackage["packageType"], query = new URLSearchParams()) {
  query.delete("addon");
  selectedPackageAddOns(ids, packageType).forEach(item => query.append("addon", item.id));
  return query;
}

// Saved snapshots retain their original prices even if the catalog changes later.
export function savedPackageAddOns(value: unknown): PackageAddOn[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is PackageAddOn => item && typeof item === "object"
    && PACKAGE_ADD_ONS.some(addOn => addOn.id === item.id)
    && typeof item.label === "string" && item.label.length <= 120
    && Number.isSafeInteger(item.amountCents) && item.amountCents >= 0);
}

export function withoutIncludedThumbnails(items: string[]) {
  return items.flatMap(item => {
    if (!/\bthumbnails?\b/i.test(item)) return [item];
    // Preserve another benefit when a saved feature combines it with a thumbnail.
    const after = item.match(/\bthumbnails?\s+(?:and|\+|&)\s+(.+)$/i)?.[1];
    const before = item.match(/^(.+?)\s+(?:and|\+|&)\s+(?:(?:one|1|a|an|\d+)\s+)?(?:custom\s+)?thumbnails?\b/i)?.[1];
    const remaining = (after || before || "").trim();
    return remaining ? [remaining[0].toUpperCase() + remaining.slice(1)] : [];
  });
}
