import { eq } from "drizzle-orm";
import { siteSettings } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";

const PRICING_PACKAGES_KEY = "pricing_packages";

export type PricingPackage = {
  id: string;
  name: string;
  slug: string;
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

export const defaultPricingPackages: PricingPackage[] = [
  {
    id: "basic",
    name: "Basic",
    slug: "basic",
    price: "$499",
    interval: "/mo",
    description: "For new creators who need clean, consistent edits.",
    features: ["4 videos monthly", "48h turnaround", "Color and audio cleanup", "2 revision rounds"],
    deliverables: ["Long-form edits", "Audio cleanup", "Color correction", "Upload-ready exports"],
    galleryImages: [],
    bestFor: "New creators building a consistent upload rhythm.",
    turnaround: "48h",
    revisions: "2 revision rounds",
    badge: "Starter lane",
    popular: false,
    active: true,
    sortOrder: 1,
  },
  {
    id: "medium",
    name: "Medium",
    slug: "medium",
    price: "$999",
    interval: "/mo",
    description: "For weekly channels that need retention polish and repurposing.",
    features: ["8 videos monthly", "24-36h turnaround", "Motion graphics", "Shorts repurposing", "Thumbnail support"],
    deliverables: ["8 videos monthly", "Motion graphics", "Shorts repurposing", "Audio cleanup", "Captions", "Upload-ready exports"],
    galleryImages: [],
    bestFor: "Weekly creators who need reliable polish across long-form videos and short-form cutdowns.",
    turnaround: "24-36h",
    revisions: "2 revision rounds",
    badge: "Most popular",
    popular: true,
    active: true,
    sortOrder: 2,
  },
  {
    id: "pro",
    name: "Pro",
    slug: "pro",
    price: "$1,899",
    interval: "/mo",
    description: "For teams that need a full editing pipeline.",
    features: ["12+ videos monthly", "Priority queue", "Premium thumbnails", "Dedicated project manager"],
    deliverables: ["Priority edits", "Unlimited short-form lane", "Premium thumbnails", "Dedicated project manager"],
    galleryImages: [],
    bestFor: "Creator teams and brands that need a managed editing pipeline.",
    turnaround: "Priority",
    revisions: "Team review lane",
    badge: "Team pipeline",
    popular: false,
    active: true,
    sortOrder: 3,
  },
];

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

function normalizePackage(value: unknown, index: number): PricingPackage | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PricingPackage>;
  const name = String(row.name || "").trim();
  const slug = packageSlug(String(row.slug || name), name);
  const price = String(row.price || "").trim();
  const description = String(row.description || "").trim();

  if (!name || !slug || !price || !description) return null;

  return {
    id: String(row.id || slug),
    name,
    slug,
    price,
    interval: String(row.interval || "/mo").trim() || "/mo",
    description,
    features: stringList(row.features),
    deliverables: stringList(row.deliverables),
    galleryImages: stringList(row.galleryImages),
    bestFor: String(row.bestFor || "").trim(),
    turnaround: String(row.turnaround || "").trim(),
    revisions: String(row.revisions || "").trim(),
    badge: String(row.badge || "").trim(),
    popular: Boolean(row.popular),
    active: row.active !== false,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1,
  };
}

export function sortPackages(packages: PricingPackage[]) {
  return [...packages].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function getPricingPackages(db: DatabaseClient) {
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, PRICING_PACKAGES_KEY)).limit(1);

  if (!row?.value) {
    return defaultPricingPackages;
  }

  try {
    const parsed = JSON.parse(row.value);
    const packages = Array.isArray(parsed)
      ? parsed.map(normalizePackage).filter((item): item is PricingPackage => Boolean(item))
      : [];

    return packages.length ? sortPackages(packages) : defaultPricingPackages;
  } catch {
    return defaultPricingPackages;
  }
}

export async function savePricingPackages(db: DatabaseClient, packages: PricingPackage[]) {
  const now = new Date();
  const value = JSON.stringify(sortPackages(packages));

  await db
    .insert(siteSettings)
    .values({ key: PRICING_PACKAGES_KEY, value, updatedAt: now })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedAt: now },
    });
}

export function publicPricingPackages(packages: PricingPackage[]) {
  return sortPackages(packages).filter((pkg) => pkg.active);
}
