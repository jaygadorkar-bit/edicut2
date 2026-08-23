import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { getMaintenanceModeEnabled, getSearchCrawlingEnabled } from "../lib/site-settings.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context ?? {});
  const [searchCrawlingEnabled, maintenanceModeEnabled] = await Promise.all([
    getSearchCrawlingEnabled(db, context),
    getMaintenanceModeEnabled(db, context),
  ]);
  const disallowCrawling = !searchCrawlingEnabled || maintenanceModeEnabled;
  const body = disallowCrawling
    ? "User-agent: *\nDisallow: /\n"
    : "User-agent: *\nAllow: /\n";

  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": disallowCrawling ? "noindex, nofollow, noarchive" : "index, follow",
    },
  });
}
