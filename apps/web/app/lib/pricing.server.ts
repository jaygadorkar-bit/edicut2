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
    id: "creator",
    name: "Creator",
    slug: "creator",
    price: "$80",
    interval: "",
    description: "A lean creator package for clean edits with subtitles, sound, color, stock assets, proofing, reels, and thumbnail support.",
    features: ["Base price: $80", "60 min podcast: $160", "600 min raw vlog footage: $160", "Subtitles", "Color grading", "Sound design & mixing", "Royalty free stock video and music", "Video proofing tool", "Content repurposing reels", "Thumbnail"],
    deliverables: ["Edited video", "Subtitles", "Color grading", "Sound design & mixing", "Reels repurposing", "Thumbnail"],
    galleryImages: [],
    bestFor: "Creators who need the core editing stack without project files, motion graphics, VFX, or AI voice over.",
    turnaround: "Based on scope",
    revisions: "Video proofing tool included",
    badge: "Base package",
    popular: false,
    active: true,
    sortOrder: 1,
  },
  {
    id: "creator-plus",
    name: "Creator Plus",
    slug: "creator-plus",
    price: "$120",
    interval: "",
    description: "For creators who need the core editing stack plus stronger podcast and vlog pricing coverage.",
    features: ["Base price: $120", "60 min podcast: $240", "600 min raw vlog footage: $200", "Subtitles", "Color grading", "Sound design & mixing", "Royalty free stock video and music", "Video proofing tool", "Content repurposing reels", "Thumbnail"],
    deliverables: ["Edited video", "Subtitles", "Color grading", "Sound design & mixing", "Reels repurposing", "Thumbnail"],
    galleryImages: [],
    bestFor: "Creators who want the standard editing stack with a better fit for longer podcast or vlog inputs.",
    turnaround: "Based on scope",
    revisions: "Video proofing tool included",
    badge: "Balanced",
    popular: true,
    active: true,
    sortOrder: 2,
  },
  {
    id: "creator-pro",
    name: "Creator Pro",
    slug: "creator-pro",
    price: "$300",
    interval: "",
    description: "The full creator package with project files, motion graphics, VFX, and AI voice over.",
    features: ["Base price: $300", "60 min podcast: $600", "600 min raw vlog footage: $380", "Subtitles", "Color grading", "Sound design & mixing", "Royalty free stock video and music", "Video proofing tool", "Content repurposing reels", "Thumbnail", "After Effects and Premiere Pro files", "Motion graphics", "VFX", "AI voice over"],
    deliverables: ["Edited video", "Subtitles", "Color grading", "Sound design & mixing", "Reels repurposing", "Thumbnail", "Project files", "Motion graphics", "VFX", "AI voice over"],
    galleryImages: [],
    bestFor: "Creators and teams that need advanced post-production assets and premium editing support.",
    turnaround: "Based on scope",
    revisions: "Video proofing tool included",
    badge: "Full stack",
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
