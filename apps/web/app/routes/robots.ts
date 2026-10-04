import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { getSiteSettingsSnapshot } from "../lib/site-settings.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { resolveWebEnv } from "../lib/context.server";
import { getCanonicalSiteOrigin, isLocalSiteUrl } from "../lib/seo";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context ?? {});
  const { searchCrawlingEnabled, maintenanceModeEnabled } = await getSiteSettingsSnapshot(db, context);
  const appUrl = resolveWebEnv(context).APP_URL;
  const disallowCrawling = !searchCrawlingEnabled || maintenanceModeEnabled || isLocalSiteUrl(appUrl);
  const body = disallowCrawling
    ? "User-agent: *\nDisallow: /\n"
    : `User-agent: *\nAllow: /\nSitemap: ${getCanonicalSiteOrigin(appUrl)}/sitemap.xml\n`;

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": disallowCrawling ? "noindex, nofollow, noarchive" : "index, follow",
    },
  });
}
