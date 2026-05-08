import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PageShell, PortfolioSection, PricingSection } from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPortfolioSections, publicPortfolioSections } from "../lib/portfolio.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";

export const meta: MetaFunction = () => [{ title: "EdiCut Portfolio | Creator video edits" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const [packages, portfolioSections] = await Promise.all([
    getPricingPackages(db).then(publicPricingPackages),
    getPortfolioSections(db).then(publicPortfolioSections),
  ]);

  return { packages, portfolioSections };
}

export default function PortfolioPage() {
  const { packages, portfolioSections } = useLoaderData<typeof loader>();

  return (
    <PageShell>
      <PortfolioSection full sections={portfolioSections} />
      <section className="px-5 py-16 sm:px-6">
        <div className="mx-auto max-w-7xl gap-5 grid md:grid-cols-4">
          {["500+ videos edited", "1.2M views generated", "32 shorts exported", "4.9 creator rating"].map((stat) => (
            <article key={stat} className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-2xl font-black">
              {stat}
            </article>
          ))}
        </div>
      </section>
      <PricingSection plans={packages} />
    </PageShell>
  );
}
