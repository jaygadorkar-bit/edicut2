import type { Config } from "@react-router/dev/config";
import { ALL_EDITING_PACKAGES } from "./app/lib/subscriptions";
import { canonicalPricingPackageSlug } from "./app/lib/pricing-slugs";
import { PUBLIC_PAGE_PATHS } from "./app/lib/public-pages";

const isProduction = process.env.NODE_ENV === "production";

async function getActivePackageSlugsForPrerender() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Static prerendering requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY at build time.");
  }

  const endpoint = new URL("/rest/v1/site_settings?key=eq.pricing_packages&select=value", supabaseUrl);
  const response = await fetch(endpoint, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) {
    throw new Error(`Static prerendering could not read the public pricing catalog${response ? ` (HTTP ${response.status})` : ""}.`);
  }

  let rows: unknown;
  try {
    rows = await response.json();
  } catch {
    throw new Error("Static prerendering received an invalid public pricing response.");
  }
  if (!Array.isArray(rows)) throw new Error("Static prerendering received an invalid public pricing response.");

  const savedValue = (rows[0] as { value?: unknown } | undefined)?.value;
  if (savedValue == null) return ALL_EDITING_PACKAGES.map((item) => item.slug);

  let savedPackages: unknown;
  try {
    savedPackages = typeof savedValue === "string" ? JSON.parse(savedValue) : savedValue;
  } catch {
    throw new Error("Static prerendering found malformed saved pricing data.");
  }
  if (!Array.isArray(savedPackages)) throw new Error("Static prerendering found malformed saved pricing data.");

  const catalogSlugs = new Set(ALL_EDITING_PACKAGES.map((item) => item.slug));
  const activeSlugs = new Set(catalogSlugs);
  for (const item of savedPackages) {
    if (!item || typeof item !== "object") throw new Error("Static prerendering found an unsupported pricing package.");
    const savedPackage = item as { slug?: unknown; name?: unknown; active?: unknown };
    const packageSlug = typeof savedPackage.slug === "string" && savedPackage.slug.trim()
      ? savedPackage.slug
      : typeof savedPackage.name === "string" ? savedPackage.name : "";
    if (!packageSlug) throw new Error("Static prerendering found a pricing package without a valid slug.");

    const slug = canonicalPricingPackageSlug(packageSlug);
    if (slug === "single-short" || slug === "single-studio") continue;
    if (!catalogSlugs.has(slug)) throw new Error("Static prerendering found a pricing package outside the current catalog.");
    if (savedPackage.active === false) activeSlugs.delete(slug);
    else activeSlugs.add(slug);
  }

  return [...activeSlugs];
}

export default {
  appDirectory: "app",
  allowedActionOrigins: isProduction ? ["edicut.com", "www.edicut.com"] : ["**"],
  ssr: true,
  prerender: async () => [
    ...PUBLIC_PAGE_PATHS,
    ...(await getActivePackageSlugsForPrerender()).map((slug) => `/pricing/${slug}`),
  ],
  routeDiscovery: {
    mode: "initial",
  },
} satisfies Config;
