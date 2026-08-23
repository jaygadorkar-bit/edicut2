import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ContactSection, FAQSection, PageShell, PricingSection, WorkflowSection } from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";
import { getSupabaseClient } from "../integrations/supabase/client.server";

export const meta: MetaFunction = () => [
  { title: "EdiCut Pricing | Creator editing packages" },
  { name: "description", content: "Transparent video editing packages for YouTube creators." },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  const packages = publicPricingPackages(await getPricingPackages(db, context));

  return { packages };
}

export default function PricingPage() {
  const { packages } = useLoaderData<typeof loader>();

  return (
    <PageShell>
      <PricingSection comparison plans={packages} />
      <WorkflowSection />
      <FAQSection />
      <ContactSection compact />
    </PageShell>
  );
}
