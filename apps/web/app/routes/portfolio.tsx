import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { PageShell, PortfolioSection, PricingSection } from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";

export const meta: MetaFunction = () => [{ title: "EdiCut Portfolio | Creator video edits" }];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const packages = publicPricingPackages(await getPricingPackages(db));

  return { packages };
}

export default function PortfolioPage() {
  const { packages } = useLoaderData<typeof loader>();

  return (
    <PageShell active="Portfolio">
      <section className="px-5 pb-10 pt-32 text-center sm:px-6">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Creator proof</p>
        <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-black tracking-tight sm:text-6xl">Edits built to keep viewers watching.</h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">Long-form videos, Shorts, podcasts, fashion stories, music videos, and commercial launches.</p>
      </section>
      <PortfolioSection full />
      <section className="px-5 py-16 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-5 md:grid-cols-4">
          {["500+ videos edited", "1.2M views generated", "32 shorts exported", "4.9 creator rating"].map((stat) => <article key={stat} className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-2xl font-black">{stat}</article>)}
        </div>
      </section>
      <PricingSection plans={packages} />
    </PageShell>
  );
}
