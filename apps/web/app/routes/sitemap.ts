import type { LoaderFunctionArgs } from "react-router";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";
import { resolveWebEnv } from "../lib/context.server";
import { escapeXml, getCanonicalSiteOrigin, isProductionSiteUrl, normalizePublicPath } from "../lib/seo";
import { PUBLIC_PAGE_PATHS } from "../lib/public-pages";
import { getSiteSettingsSnapshot } from "../lib/site-settings.server";
import { getSeoAdminSettings, type SeoAdminSettings } from "../lib/seo-admin.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context ?? {});
  const [{ searchCrawlingEnabled, maintenanceModeEnabled }, seoSettings] = await Promise.all([
    getSiteSettingsSnapshot(db, context),
    getSeoAdminSettings(db, context),
  ]);
  const appUrl = resolveWebEnv(context).APP_URL;

  if (!searchCrawlingEnabled || maintenanceModeEnabled || !isProductionSiteUrl(appUrl)) {
    return new Response("Sitemap unavailable while indexing is disabled.\n", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  const packages = publicPricingPackages(await getPricingPackages(db, context));
  const origin = getCanonicalSiteOrigin(appUrl);
  const paths = [
    ...PUBLIC_PAGE_PATHS,
    ...packages.map((item) => `/pricing/${item.slug}`),
  ];
  const canonicalPaths = filterIndexableSitemapPaths(paths, seoSettings);
  const locations = canonicalPaths.map((path) => escapeXml(new URL(path, `${origin}/`).toString()));
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locations.map((location) => `  <url><loc>${location}</loc></url>`),
    '</urlset>',
    '',
  ].join("\n");

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "Content-Type": "application/xml; charset=utf-8",
    },
  });
}

export function filterIndexableSitemapPaths(paths: readonly string[], settings: Pick<SeoAdminSettings, "pageOverrides" | "redirects">) {
  const overridesByPath = new Map(settings.pageOverrides.map((override) => [override.path, override]));
  const activeRedirectSources = new Set(settings.redirects.filter((item) => item.enabled).map((item) => item.from));
  return [...new Set(paths)].filter((path) => {
    const normalized = normalizePublicPath(path);
    const override = overridesByPath.get(normalized);
    return override?.indexable !== false
      && (!override?.canonicalPath || normalizePublicPath(override.canonicalPath) === normalized)
      && !activeRedirectSources.has(normalized);
  });
}
