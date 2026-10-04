import { packageAddOnQuery } from "./package-addons";

export type PackageBase = {
  name: string;
  slug: string;
  description: string;
  badge: string;
  bestFor: string;
  features: string[];
  deliverables: string[];
  basePrice: number;
};

export type SubscriptionPackage = PackageBase & {
  packageType: "monthly";
  editingHoursPerMonth: number;
  editingHoursPerWorkday: number;
  workingDaysPerMonth: 22;
};

export type SingleVideoPackage = PackageBase & {
  packageType: "single";
  videoFormat: string;
  finishedLength: string;
  rawFootageLimit: string;
  revisionRounds: number;
  firstCutHours: number;
};

export type EditingPackage = SubscriptionPackage | SingleVideoPackage;

export const REQUIRED_PACKAGE_STAFFING = ["Personal project manager", "Dedicated video editor"] as const;
export const STUDIO_PACKAGE_STAFFING = ["Personal project manager", "Two dedicated video editors"] as const;

export const SUBSCRIPTION_PACKAGES: SubscriptionPackage[] = [
  {
    packageType: "monthly",
    name: "Starter",
    slug: "creator",
    description: "Four editing hours each workday, with clear monthly capacity for a steady publishing schedule.",
    badge: "Start steady",
    bestFor: "Solo creators who want dependable editing help without reserving a full-time editor.",
    editingHoursPerMonth: 88,
    editingHoursPerWorkday: 4,
    workingDaysPerMonth: 22,
    features: ["88 reserved editing hours per month", "4 editing hours per standard workday", "Captions, basic color and audio cleanup", "1 revision round per edit, within the monthly hours", "Unused hours do not roll over", ...REQUIRED_PACKAGE_STAFFING],
    deliverables: ["88 editing hours per month", "4 editing hours per workday across 22 working days", "Captions, basic color and audio cleanup", "1 revision round per edit, included in the reserved hours", ...REQUIRED_PACKAGE_STAFFING],
    basePrice: 2149,
  },
  {
    packageType: "monthly",
    name: "Growth",
    slug: "creator-plus",
    description: "Five editing hours each workday for creators who want a reliable weekly rhythm and room to repurpose footage.",
    badge: "Most popular",
    bestFor: "Creators and small teams with a steady pipeline of long-form and short-form edits.",
    editingHoursPerMonth: 110,
    editingHoursPerWorkday: 5,
    workingDaysPerMonth: 22,
    features: ["110 reserved editing hours per month", "5 editing hours per standard workday", "Captions, color and audio finishing", "Licensed stock and B-roll from our included asset library", "Editing and revisions draw from the monthly hours", "Unused hours do not roll over", ...REQUIRED_PACKAGE_STAFFING],
    deliverables: ["110 editing hours per month", "5 editing hours per workday across 22 working days", "Captions, color and audio finishing", "Licensed stock and B-roll from our included asset library", "Editing and revisions draw from the monthly hours", ...REQUIRED_PACKAGE_STAFFING],
    basePrice: 2649,
  },
  {
    packageType: "monthly",
    name: "Studio",
    slug: "creator-pro",
    description: "Five editing hours each workday shared by two editors for established channels with a larger production pipeline.",
    badge: "More capacity",
    bestFor: "Established creators and production teams with regular editing work throughout the month.",
    editingHoursPerMonth: 110,
    editingHoursPerWorkday: 5,
    workingDaysPerMonth: 22,
    features: ["110 reserved editing hours per month shared by two editors", "5 editing hours per standard workday", "Captions, color and audio finishing", "Licensed stock and B-roll from our included asset library", "Light template-based branded motion", "Editing and revisions draw from the monthly hours", "Unused hours do not roll over", ...STUDIO_PACKAGE_STAFFING],
    deliverables: ["110 editing hours per month shared by two editors", "5 editing hours per workday across 22 working days", "Captions, color and audio finishing", "Licensed stock and B-roll from our included asset library", "Light template-based branded motion", "Editing and revisions draw from the monthly hours", ...STUDIO_PACKAGE_STAFFING],
    basePrice: 3149,
  },
];

export const SINGLE_VIDEO_PACKAGES: SingleVideoPackage[] = [
  {
    packageType: "single",
    name: "Creator Video",
    slug: "single-creator",
    description: "A complete, clean long-form edit for your next creator upload.",
    badge: "Most popular",
    bestFor: "A YouTube, podcast, or educational video with a clear brief and established style.",
    videoFormat: "One standard long-form edit",
    finishedLength: "Up to 8 minutes",
    rawFootageLimit: "Up to 60 minutes",
    revisionRounds: 1,
    firstCutHours: 48,
    features: ["Captions, pacing, and clean cuts", "Basic color and audio finishing", "One revision round", ...REQUIRED_PACKAGE_STAFFING],
    deliverables: ["1 edited video up to 8 minutes", "Captions", "Basic color and audio finishing", "1 revision round", ...REQUIRED_PACKAGE_STAFFING],
    basePrice: 109,
  },
  {
    packageType: "single",
    name: "Studio Video",
    slug: "single-studio",
    description: "A more detailed long-form edit with extra room for branded polish.",
    badge: "More polish",
    bestFor: "A channel launch, feature video, or more involved edit that needs additional finishing.",
    videoFormat: "One enhanced long-form edit",
    finishedLength: "Up to 15 minutes",
    rawFootageLimit: "Up to 120 minutes",
    revisionRounds: 2,
    firstCutHours: 48,
    features: ["Captions and advanced pacing", "Color and audio finishing", "Licensed stock and B-roll from our included asset library", "Light template-based branded motion", "Two revision rounds", ...REQUIRED_PACKAGE_STAFFING],
    deliverables: ["1 edited video up to 15 minutes", "Captions", "Color and audio finishing", "Licensed stock and B-roll from our included asset library", "Light template-based branded motion", "2 revision rounds", ...REQUIRED_PACKAGE_STAFFING],
    basePrice: 179,
  },
  {
    packageType: "single",
    name: "Feature Video",
    slug: "single-feature",
    description: "A larger long-form edit with more runtime, footage, and room for thoughtful storytelling.",
    badge: "Extended edit",
    bestFor: "Feature videos, deep-dive tutorials, or creator stories that need more structure and polish.",
    videoFormat: "One feature-length edit",
    finishedLength: "Up to 30 minutes",
    rawFootageLimit: "Up to 240 minutes",
    revisionRounds: 3,
    firstCutHours: 48,
    features: ["Narrative structure and advanced pacing", "Color and audio finishing", "Licensed stock and B-roll from our included asset library", "Light template-based branded motion", "Three revision rounds", ...REQUIRED_PACKAGE_STAFFING],
    deliverables: ["1 edited video up to 30 minutes", "Narrative structure and advanced pacing", "Color and audio finishing", "Licensed stock and B-roll from our included asset library", "Light template-based branded motion", "3 revision rounds", ...REQUIRED_PACKAGE_STAFFING],
    basePrice: 249,
  },
];

export const ALL_EDITING_PACKAGES: EditingPackage[] = [...SUBSCRIPTION_PACKAGES, ...SINGLE_VIDEO_PACKAGES];

export function formatPackagePrice(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function parsePackagePrice(value: string) {
  const raw = value.trim().replace(/^\$/, "");
  if (!/^(?:(?:0|[1-9]\d{0,5})|(?:[1-9]\d{0,2}(?:,\d{3})+))(?:\.00)?$/.test(raw)) return null;
  const amount = Number(raw.replaceAll(",", ""));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function getCatalogPackage(slug: string) {
  return ALL_EDITING_PACKAGES.find((item) => item.slug === slug);
}

export function getPackageIndex(slug: string, packages: Array<{ slug: string }>) {
  return packages.findIndex((item) => item.slug === slug);
}

export function getSubscriptionPackage(name: string, slug: string, index: number): SubscriptionPackage {
  const canonical = SUBSCRIPTION_PACKAGES.find((item) => item.slug === slug);
  if (canonical) return canonical;

  const key = `${name} ${slug}`.toLowerCase();
  if (key.includes("plus") || index === 1) return SUBSCRIPTION_PACKAGES[1];
  if (key.includes("pro") || index === 2) return SUBSCRIPTION_PACKAGES[2];
  return SUBSCRIPTION_PACKAGES[0];
}

export function getCheckoutTotal(editingPackage: EditingPackage, _legacyCoverage?: { runtime?: boolean; raw?: boolean }) {
  return editingPackage.basePrice;
}

export function formatRequestedCoverageNotes(
  _subscription: SubscriptionPackage,
  userNotes: string,
  options: { runtime?: boolean; raw?: boolean } = {},
) {
  const selectedCoverage = [
    options.runtime ? "60 additional finished minutes (availability and price to be confirmed)" : null,
    options.raw ? "600 additional raw footage minutes (availability and price to be confirmed)" : null,
  ].filter((item): item is string => item !== null);
  const brief = userNotes.trim();
  if (!selectedCoverage.length) return brief || null;

  const coverage = `Additional coverage request: ${selectedCoverage.join("; ")}. This work is outside the package scope and will be quoted separately.`;
  return brief ? `${coverage}\n\nCustomer brief:\n${brief}` : coverage;
}

export function getCheckoutUrl(editingPackage: EditingPackage, options: { runtime?: boolean; raw?: boolean; affiliateCode?: string; addOns?: readonly string[] } = {}) {
  const params = new URLSearchParams();
  if (options.runtime && editingPackage.packageType === "monthly") params.set("runtime", "1");
  if (options.raw && editingPackage.packageType === "monthly") params.set("raw", "1");
  packageAddOnQuery(options.addOns ?? [], params);
  const affiliateCode = options.affiliateCode?.trim().toUpperCase();
  if (affiliateCode && /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(affiliateCode)) params.set("ref", affiliateCode);
  const query = params.toString();
  return `/checkout/${editingPackage.slug}${query ? `?${query}` : ""}`;
}
