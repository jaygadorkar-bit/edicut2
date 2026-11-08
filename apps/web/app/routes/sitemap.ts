import type { LoaderFunctionArgs } from "react-router";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";
import { resolveWebEnv } from "../lib/context.server";
import { escapeXml, getCanonicalSiteOrigin, isProductionSiteUrl } from "../lib/seo";
import { PUBLIC_PAGE_PATHS } from "../lib/public-pages";
import { getSiteSettingsSnapshot } from "../lib/site-settings.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context ?? {});
  const { searchCrawlingEnabled, maintenanceModeEnabled } = await getSiteSettingsSnapshot(db, context);
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
  const locations = [...new Set(paths)].map((path) => escapeXml(new URL(path, `${origin}/`).toString()));
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
