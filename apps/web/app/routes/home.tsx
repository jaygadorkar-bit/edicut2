import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import {
  ButtonLink,
  ContactSection,
  DifferentiatorsSection,
  FAQSection,
  PageShell,
  PortfolioSection,
  PricingSection,
  TestimonialsSection,
  TrustStrip,
  WorkflowSection,
} from "../components/site/Marketing.js";
import { getDbFromContext } from "../lib/db.server";
import { getPortfolioSections, publicPortfolioSections } from "../lib/portfolio.server";
import { getPricingPackages, publicPricingPackages } from "../lib/pricing.server";

export const meta: MetaFunction = () => {
  return [
    { title: "EdiCut — Editing built for YouTubers" },
    { name: "description", content: "Clean editing pipeline for long-form YouTube, Shorts, thumbnails, and review-ready deliverables." },
  ];
};

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const [packages, portfolioSections] = await Promise.all([
    getPricingPackages(db).then(publicPricingPackages),
    getPortfolioSections(db).then(publicPortfolioSections),
  ]);

  return { packages, portfolioSections };
}

export default function HomePage() {
  const { packages, portfolioSections } = useLoaderData<typeof loader>();

  return (
    <PageShell>
      <section className="bg-white px-5 pb-16 pt-32 text-center sm:px-6 lg:pb-20 lg:pt-36">
        <div className="mx-auto max-w-5xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Editing service for YouTubers
          </div>
          <h1 className="mx-auto mt-7 max-w-4xl text-5xl font-black leading-[1.02] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Publish better videos without living in the timeline.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            A creator-first editing pipeline for long-form YouTube, Shorts, thumbnails, and review-ready deliverables.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink to="/pricing">Compare packages</ButtonLink>
            <ButtonLink to="/portfolio" variant="secondary">Watch the reel</ButtonLink>
          </div>
          <div className="mx-auto mt-10 grid max-w-2xl grid-cols-3 divide-x divide-gray-200 rounded-2xl border border-gray-100 bg-white p-4">
            {["48h first cuts", "500+ videos edited", "4.9 creator rating"].map((stat) => (
              <div key={stat} className="px-3">
                <p className="text-2xl font-black">{stat.split(" ")[0]}</p>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">{stat.split(" ").slice(1).join(" ")}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <TrustStrip />
      <WorkflowSection />
      <PortfolioSection sections={portfolioSections} />
      <DifferentiatorsSection />
      <TestimonialsSection />
      <PricingSection plans={packages} />
      <FAQSection />
      <ContactSection compact />
    </PageShell>
  );
}
