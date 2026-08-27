import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ButtonLink, PageShell, PricingSection } from "../components/site/Marketing.js";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";

export const meta: MetaFunction = () => [
  { title: "Pricing | EdiCut Creator Post-Production" },
  { name: "description", content: "Compare EdiCut creator editing plans and choose the right support for your publishing rhythm." },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  return {
    packages: await getPricingPackages(db, context).then(publicPricingPackages),
  };
}

export default function PricingPage() {
  const { packages } = useLoaderData<typeof loader>();

  return (
    <PageShell>
      <section className="relative overflow-hidden border-b neo-line px-5 pb-14 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
        <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-[#e2c9ce]/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#cbdbe8]/60 blur-3xl" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="yt-tag text-primary neo-section-label">EdiCut pricing</p>
          <h1 className="yt-display mt-5 neo-ink">Plans built for a steadier publishing rhythm.</h1>
          <p className="yt-subtitle mx-auto mt-6 max-w-2xl leading-8 neo-muted">
            Choose the editing lane that fits your footage volume today, then scale up as your channel grows.
          </p>
          <div className="mt-8">
            <ButtonLink to="/contact" variant="secondary">
              Talk through your scope
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </ButtonLink>
          </div>
        </div>
      </section>
      <PricingSection comparison plans={packages} />
    </PageShell>
  );
}
