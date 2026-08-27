import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ButtonLink, PageShell, PortfolioSection } from "../components/site/Marketing.js";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { getDbFromContext } from "../lib/db.server";
import { getPortfolioSections, publicPortfolioSections } from "../lib/portfolio.server";

export const meta: MetaFunction = () => [
  { title: "Portfolio | EdiCut Creator Post-Production" },
  { name: "description", content: "Explore EdiCut edits across podcasts, gaming, commercial, review, and health content." },
];

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  return {
    portfolioSections: await getPortfolioSections(db, context).then(publicPortfolioSections),
  };
}

export default function PortfolioPage() {
  const { portfolioSections } = useLoaderData<typeof loader>();

  return (
    <PageShell>
      <section className="relative overflow-hidden border-b neo-line px-5 pb-14 pt-14 sm:px-6 sm:pb-16 sm:pt-20">
        <div className="pointer-events-none absolute -right-24 top-0 h-72 w-72 rounded-full bg-[#e2c9ce]/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-[#cbdbe8]/60 blur-3xl" />
        <div className="relative mx-auto max-w-4xl text-center">
          <p className="yt-tag text-primary neo-section-label">EdiCut portfolio</p>
          <h1 className="yt-display mt-5 neo-ink">Edits built to keep viewers watching.</h1>
          <p className="yt-subtitle mx-auto mt-6 max-w-2xl leading-8 neo-muted">
            Browse the editing lanes, pacing choices, and formats we use to turn raw footage into publish-ready work.
          </p>
          <div className="mt-8">
            <ButtonLink to="/contact" variant="secondary">
              Start a project
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </ButtonLink>
          </div>
        </div>
      </section>
      <PortfolioSection full sections={portfolioSections} />
    </PageShell>
  );
}
