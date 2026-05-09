export type SubscriptionPackage = {
  name: string;
  slug: string;
  description: string;
  badge: string;
  bestFor: string;
  deliverables: string[];
  basePrice: number;
  finishedRuntimePrice: number;
  rawFootagePrice: number;
};

export const SUBSCRIPTION_PACKAGES: SubscriptionPackage[] = [
  {
    name: "Creator",
    slug: "creator",
    description: "A lean creator package for clean edits with subtitles, sound, color, stock assets, proofing, reels, and thumbnail support.",
    badge: "Base package",
    bestFor: "Creators who need the core editing stack without advanced project-file and effects deliverables.",
    deliverables: ["Subtitles", "Color grading", "Sound design & mixing", "Royalty free stock video", "Royalty free stock music", "Video proofing tool", "Reels repurposing", "Thumbnail"],
    basePrice: 80,
    finishedRuntimePrice: 160,
    rawFootagePrice: 160,
  },
  {
    name: "Creator Plus",
    slug: "creator-plus",
    description: "Core creator editing with stronger coverage for longer podcast or vlog inputs.",
    badge: "Balanced",
    bestFor: "Creators who want the standard editing stack with a better fit for longer podcast or vlog source material.",
    deliverables: ["Subtitles", "Color grading", "Sound design & mixing", "Royalty free stock video", "Royalty free stock music", "Video proofing tool", "Reels repurposing", "Thumbnail"],
    basePrice: 120,
    finishedRuntimePrice: 240,
    rawFootagePrice: 200,
  },
  {
    name: "Creator Pro",
    slug: "creator-pro",
    description: "The full creator package with project files, motion graphics, VFX, and AI voice over.",
    badge: "Full stack",
    bestFor: "Creators and teams that need advanced post-production assets and premium editing support.",
    deliverables: ["Subtitles", "Color grading", "Sound design & mixing", "Royalty free stock video", "Royalty free stock music", "Video proofing tool", "Reels repurposing", "Thumbnail", "After Effects and Premiere Pro files", "Motion graphics", "VFX", "AI voice over"],
    basePrice: 300,
    finishedRuntimePrice: 600,
    rawFootagePrice: 380,
  },
];

export function getPackageIndex(slug: string, packages: Array<{ slug: string }>) {
  const canonicalIndex = SUBSCRIPTION_PACKAGES.findIndex((item) => item.slug === slug);
  if (canonicalIndex >= 0) return canonicalIndex;
  return Math.max(packages.findIndex((item) => item.slug === slug), 0);
}

export function getSubscriptionPackage(name: string, slug: string, index: number): SubscriptionPackage {
  const canonicalIndex = SUBSCRIPTION_PACKAGES.findIndex((item) => item.slug === slug);
  if (canonicalIndex >= 0) return SUBSCRIPTION_PACKAGES[canonicalIndex];

  const key = `${name} ${slug}`.toLowerCase();

  if (key.includes("plus") || index === 1) {
    return SUBSCRIPTION_PACKAGES[1];
  }

  if (key.includes("pro") || index === 2) {
    return SUBSCRIPTION_PACKAGES[2];
  }

  return SUBSCRIPTION_PACKAGES[0];
}

export function getCheckoutTotal(subscription: SubscriptionPackage, options: { runtime: boolean; raw: boolean }) {
  return subscription.basePrice
    + (options.runtime ? subscription.finishedRuntimePrice : 0)
    + (options.raw ? subscription.rawFootagePrice : 0);
}

export function getCheckoutUrl(subscription: SubscriptionPackage, options: { runtime: boolean; raw: boolean }) {
  const params = new URLSearchParams();
  if (options.runtime) params.set("runtime", "1");
  if (options.raw) params.set("raw", "1");
  const query = params.toString();
  return `/checkout/${subscription.slug}${query ? `?${query}` : ""}`;
}
