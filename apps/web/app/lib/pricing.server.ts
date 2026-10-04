import type { DatabaseClient } from "@edicut/db/client";
import type { SupabaseRuntimeContext } from "../integrations/supabase/client.server";
import { ALL_EDITING_PACKAGES, formatPackagePrice, getCatalogPackage, parsePackagePrice, REQUIRED_PACKAGE_STAFFING, STUDIO_PACKAGE_STAFFING, type EditingPackage } from "./subscriptions";
import { getSiteSetting, saveSiteSetting } from "./site-settings.server";
import { withoutIncludedThumbnails } from "./package-addons";

const PRICING_PACKAGES_KEY = "pricing_packages";

export type PricingPackage = {
  id: string;
  name: string;
  slug: string;
  packageType: "single" | "monthly";
  editingHoursPerMonth: number | null;
  editingHoursPerWorkday: number | null;
  price: string;
  interval: string;
  description: string;
  features: string[];
  deliverables: string[];
  galleryImages: string[];
  bestFor: string;
  turnaround: string;
  revisions: string;
  badge: string;
  popular: boolean;
  active: boolean;
  sortOrder: number;
};

export const defaultPricingPackages: PricingPackage[] = ALL_EDITING_PACKAGES.map((editingPackage, index) => ({
  id: editingPackage.slug,
  name: editingPackage.name,
  slug: editingPackage.slug,
  packageType: editingPackage.packageType,
  editingHoursPerMonth: editingPackage.packageType === "monthly" ? editingPackage.editingHoursPerMonth : null,
  editingHoursPerWorkday: editingPackage.packageType === "monthly" ? editingPackage.editingHoursPerWorkday : null,
  price: formatPackagePrice(editingPackage.basePrice),
  interval: editingPackage.packageType === "monthly" ? "/month" : "one-time",
  description: editingPackage.description,
  features: editingPackage.features,
  deliverables: editingPackage.deliverables,
  galleryImages: [],
  bestFor: editingPackage.bestFor,
  turnaround: editingPackage.packageType === "monthly"
    ? `${editingPackage.editingHoursPerWorkday} editing ${editingPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"} per workday`
    : `First cut within ${editingPackage.firstCutHours} hours`,
  revisions: editingPackage.packageType === "monthly"
    ? "Editing and revisions use the reserved monthly hours"
    : `${editingPackage.revisionRounds} revision ${editingPackage.revisionRounds === 1 ? "round" : "rounds"}`,
  badge: editingPackage.badge,
  popular: editingPackage.slug === "creator-plus" || editingPackage.slug === "single-creator",
  active: true,
  sortOrder: index + 1,
}));

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createPackageId() {
  return `pkg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function packageSlug(value: string, fallback: string) {
  return normalizeSlug(value) || normalizeSlug(fallback) || createPackageId();
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function includePackageRequirements(items: string[], catalogPackage: EditingPackage, list: "features" | "deliverables") {
  items = withoutIncludedThumbnails(items);
  const isStudio = catalogPackage.slug === "creator-pro";
  const withoutSupersededEditorCount = isStudio
    ? items.filter((item) => item.toLocaleLowerCase() !== "dedicated video editor")
    : items;
  const capacityLine = /\bediting hours?\s+per\s+(?:month|standard workday|workday across \d+ working days)\b/i;
  const withoutStaleCapacity = catalogPackage.packageType === "monthly"
    ? withoutSupersededEditorCount.filter((item) => !capacityLine.test(item))
    : withoutSupersededEditorCount;
  const currentCapacity = catalogPackage.packageType === "monthly"
    ? catalogPackage[list].filter((item) => capacityLine.test(item))
    : [];
  const requiredStaffing = isStudio ? STUDIO_PACKAGE_STAFFING : REQUIRED_PACKAGE_STAFFING;
  const combined = [...withoutStaleCapacity, ...currentCapacity];
  const included = new Set(combined.map((item) => item.toLocaleLowerCase()));
  return [...combined, ...requiredStaffing.filter((item) => !included.has(item.toLocaleLowerCase()))];
}

function normalizePackage(value: unknown, index: number): PricingPackage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PricingPackage>;
  const name = String(row.name || "").trim();
  const slug = packageSlug(String(row.slug || name), name);
  const price = String(row.price || "").trim();
  const description = String(row.description || "").trim();
  const savedSortOrder = typeof row.sortOrder === "number" ? row.sortOrder : null;

  const catalogPackage = getCatalogPackage(slug);
  if (!name || !slug || !price || !description || !catalogPackage) return null;

  return {
    id: String(row.id || slug),
    name,
    slug,
    packageType: catalogPackage.packageType,
    editingHoursPerMonth: catalogPackage.packageType === "monthly" ? catalogPackage.editingHoursPerMonth : null,
    editingHoursPerWorkday: catalogPackage.packageType === "monthly" ? catalogPackage.editingHoursPerWorkday : null,
    price,
    interval: catalogPackage.packageType === "monthly" ? "/month" : "one-time",
    description,
    features: includePackageRequirements(stringList(row.features), catalogPackage, "features"),
    deliverables: includePackageRequirements(stringList(row.deliverables), catalogPackage, "deliverables"),
    galleryImages: stringList(row.galleryImages),
    bestFor: String(row.bestFor || "").trim(),
    turnaround: String(row.turnaround || "").trim(),
    revisions: String(row.revisions || "").trim(),
    badge: String(row.badge || "").trim(),
    popular: Boolean(row.popular),
    active: row.active !== false,
    sortOrder: savedSortOrder !== null && Number.isSafeInteger(savedSortOrder) && savedSortOrder >= 0 ? savedSortOrder : index + 1,
  };
}

export function sortPackages(packages: PricingPackage[]) {
  return [...packages].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function hasOutdatedDefaultCapacityCopy(pkg: PricingPackage) {
  const oldDescriptionStarts: Record<string, string> = {
    creator: "a focused hour of editing each workday",
    "creator-plus": "two editing hours per workday",
    "creator-pro": "three editing hours per workday",
  };
  const oldStart = oldDescriptionStarts[pkg.slug];
  return Boolean(oldStart && pkg.description.trim().toLocaleLowerCase().startsWith(oldStart));
}

function replaceLegacyDefaultPricing(packages: PricingPackage[]) {
  const legacyMonthlyPriceSnapshots = [
    new Map([["creator", "$80"], ["creator-plus", "$120"], ["creator-pro", "$300"]]),
    new Map([["creator", "$249"], ["creator-plus", "$549"], ["creator-pro", "$1,099"]]),
    new Map([["creator", "$549"], ["creator-plus", "$1,049"], ["creator-pro", "$1,549"]]),
    new Map([["creator", "$3,049"], ["creator-plus", "$3,699"], ["creator-pro", "$4,299"]]),
  ];
  const monthlyPackages = packages.filter((pkg) => pkg.packageType === "monthly");
  const isLegacyMonthlySnapshot = monthlyPackages.length === 3 && legacyMonthlyPriceSnapshots.some((snapshot) =>
    snapshot.size === monthlyPackages.length && [...snapshot].every(([slug, price]) =>
      monthlyPackages.some((pkg) => pkg.slug === slug && pkg.price === price),
    ),
  );

  const merged = defaultPricingPackages.map((plan) => {
    const previous = packages.find((pkg) => pkg.slug === plan.slug);
    if (!previous) return plan;
    const refreshDefaults = (plan.packageType === "monthly" && isLegacyMonthlySnapshot)
      || parsePackagePrice(previous.price) === null;
    const refreshFeaturePrice = plan.slug === "single-feature" && parsePackagePrice(previous.price) === 189;
    return {
      ...plan,
      ...(!refreshDefaults ? previous : {}),
      // Product type, time allowance, and billing interval come from the catalog.
      packageType: plan.packageType,
      editingHoursPerMonth: plan.editingHoursPerMonth,
      editingHoursPerWorkday: plan.editingHoursPerWorkday,
      interval: plan.interval,
      price: refreshDefaults || refreshFeaturePrice ? plan.price : previous.price,
      description: (plan.packageType === "monthly" && isLegacyMonthlySnapshot) || hasOutdatedDefaultCapacityCopy(previous)
        ? plan.description
        : previous.description,
      id: previous.id || plan.id,
      galleryImages: previous.galleryImages,
      active: previous.active,
      sortOrder: previous.sortOrder,
    };
  });

  return sortPackages(merged);
}

export async function getPricingPackages(db: DatabaseClient | null | undefined, context?: SupabaseRuntimeContext) {
  const value = await getSiteSetting(db, PRICING_PACKAGES_KEY, context, { failOnError: true });

  if (!value) {
    return defaultPricingPackages;
  }

  try {
    const parsed = JSON.parse(value);
    const packages = Array.isArray(parsed)
      ? parsed.map(normalizePackage).filter((item): item is PricingPackage => Boolean(item))
      : [];

    return packages.length ? replaceLegacyDefaultPricing(packages) : defaultPricingPackages;
  } catch {
    return defaultPricingPackages;
  }
}

export async function savePricingPackages(db: DatabaseClient | null | undefined, packages: PricingPackage[], context?: SupabaseRuntimeContext) {
  const value = JSON.stringify(sortPackages(packages));
  await saveSiteSetting(db, PRICING_PACKAGES_KEY, value, context);
}

export function publicPricingPackages(packages: PricingPackage[]) {
  return sortPackages(packages).filter((pkg) => pkg.active).map((pkg) => {
    const catalogPackage = getCatalogPackage(pkg.slug);
    if (!catalogPackage) return pkg;
    return {
      ...pkg,
      features: includePackageRequirements(pkg.features, catalogPackage, "features"),
      deliverables: includePackageRequirements(pkg.deliverables, catalogPackage, "deliverables"),
    };
  });
}

export function configuredEditingPackage(slug: string, packages: PricingPackage[]): EditingPackage | null {
  const catalogPackage = getCatalogPackage(slug);
  const configuredPackage = packages.find((pkg) => pkg.slug === slug && pkg.active);
  if (!catalogPackage || !configuredPackage) return null;

  const configuredPrice = parsePackagePrice(configuredPackage.price);
  return {
    ...catalogPackage,
    name: configuredPackage.name,
    description: configuredPackage.description,
    features: includePackageRequirements(configuredPackage.features.length ? configuredPackage.features : catalogPackage.features, catalogPackage, "features"),
    deliverables: includePackageRequirements(configuredPackage.deliverables.length ? configuredPackage.deliverables : catalogPackage.deliverables, catalogPackage, "deliverables"),
    bestFor: configuredPackage.bestFor || catalogPackage.bestFor,
    badge: configuredPackage.badge || catalogPackage.badge,
    basePrice: configuredPrice ?? catalogPackage.basePrice,
  };
}

export function configuredPublicEditingPackages(packages: PricingPackage[]) {
  return sortPackages(packages).flatMap((savedPackage) => {
    const configured = configuredEditingPackage(savedPackage.slug, packages);
    return configured ? [configured] : [];
  });
}
