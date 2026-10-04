export const PACKAGE_ADD_ONS = [
  { id: "thumbnail", label: "Custom thumbnail", description: "One thumbnail designed for your video.", amountCents: 2000 },
  { id: "short-form", label: "Short-form video", description: "One vertical cut from your supplied footage.", amountCents: 2000 },
] as const;

export type PackageAddOnId = typeof PACKAGE_ADD_ONS[number]["id"];
export type PackageAddOn = { id: PackageAddOnId; label: string; amountCents: number };

// Prices and labels always come from the catalog, never from submitted fields.
export function selectedPackageAddOns(ids: readonly string[]): PackageAddOn[] {
  return PACKAGE_ADD_ONS.filter(item => ids.includes(item.id)).map(({ id, label, amountCents }) => ({ id, label, amountCents }));
}

export function parsePackageAddOns(values: readonly unknown[]): PackageAddOn[] | null {
  if (values.length > PACKAGE_ADD_ONS.length || values.some(value => typeof value !== "string" || !PACKAGE_ADD_ONS.some(item => item.id === value))) return null;
  if (new Set(values).size !== values.length) return null;
  return selectedPackageAddOns(values as string[]);
}

export function packageAddOnTotal(addOns: readonly PackageAddOn[]) {
  return addOns.reduce((total, item) => total + item.amountCents, 0);
}

export function packageAddOnQuery(ids: readonly string[], query = new URLSearchParams()) {
  query.delete("addon");
  selectedPackageAddOns(ids).forEach(item => query.append("addon", item.id));
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
