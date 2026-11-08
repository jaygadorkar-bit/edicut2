const legacyPricingSlugs: Record<string, string> = {
  basic: "creator",
  medium: "creator-plus",
  pro: "creator-pro",
};

export function canonicalPricingPackageSlug(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return legacyPricingSlugs[slug] ?? slug;
}
