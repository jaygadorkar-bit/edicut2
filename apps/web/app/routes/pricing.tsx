import type { LinksFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { PageShell } from "../components/site/Marketing.js";
import { PricingPacks } from "../components/site/PricingPacks";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { getDbFromContext } from "../lib/db.server";
import { configuredPublicEditingPackages, getPricingPackages } from "../lib/pricing.server";
import { createRouteMeta } from "../lib/seo";
import pricingStyles from "../styles/pricing.css?url";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: pricingStyles }];

export const meta: MetaFunction = (args) => createRouteMeta(args,
  "Video Editing Prices: Single Videos and Monthly Packages | EdiCut",
  "Choose a single video edit or a monthly package from EdiCut. Compare clear scope, editing capacity, delivery targets, and prices.",
);

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  return {
    packages: configuredPublicEditingPackages(await getPricingPackages(db, context)),
  };
}

export default function PricingPage() {
  const { packages } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const initialKind = searchParams.get("type") === "monthly" ? "monthly" : "single";

  return (
    <PageShell>
      <PricingPacks key={initialKind} packages={packages} initialKind={initialKind} />
    </PageShell>
  );
}
