import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ArrowDown, ArrowUpRight, Check, Clapperboard, Film, Layers3, Scissors } from "lucide-react";
import { PageShell, PortfolioSection } from "../components/site/Marketing.js";
import { getSupabaseClient } from "../integrations/supabase/client.server";
import { getDbFromContext } from "../lib/db.server";
import { getPortfolioSections, publicPortfolioSections } from "../lib/portfolio.server";
import { createRouteMeta } from "../lib/seo";
import { formatPackagePrice, type SubscriptionPackage } from "../lib/subscriptions";
import { configuredPublicEditingPackages, getPricingPackages } from "../lib/pricing.server";
import "../styles/portfolio.css";

export const meta: MetaFunction = (args) => createRouteMeta(args,
  "Video Editing Portfolio: YouTube, Podcasts, and More | EdiCut",
  "Explore EdiCut video editing examples across YouTube, podcasts, gaming, commercial, review, and health content.",
);

export async function loader({ context }: LoaderFunctionArgs) {
  const db = getSupabaseClient(context) ? null : getDbFromContext(context);
  const [portfolioSections, pricingPackages] = await Promise.all([
    getPortfolioSections(db, context).then(publicPortfolioSections),
    getPricingPackages(db, context),
  ]);
  return {
    portfolioSections,
    monthlyPackages: configuredPublicEditingPackages(pricingPackages).filter((item): item is SubscriptionPackage => item.packageType === "monthly"),
  };
}

export default function PortfolioPage() {
  const { portfolioSections, monthlyPackages } = useLoaderData<typeof loader>();
  const startingPrice = monthlyPackages.length ? Math.min(...monthlyPackages.map((pack) => pack.basePrice)) : null;

  return (
    <PageShell className="portfolio-page">
      <section className="portfolio-hero" aria-labelledby="portfolio-title">
        <div className="portfolio-hero-objects" aria-hidden="true">
          <Clapperboard className="portfolio-hero-object portfolio-hero-object--clapper" strokeWidth={1.5} />
          <Scissors className="portfolio-hero-object portfolio-hero-object--scissors" strokeWidth={1.5} />
          <Film className="portfolio-hero-object portfolio-hero-object--film" strokeWidth={1.5} />
        </div>
        <div className="portfolio-container portfolio-hero-layout">
          <div className="portfolio-hero-copy">
            <p className="portfolio-kicker"><Film size={18} aria-hidden="true" /> Our portfolio</p>
            <h1 id="portfolio-title">A better cut.<br />A better story.</h1>
            <p className="portfolio-description">
              A strong hook. The right pace. A finish that feels like you.
              Explore editing styles for your next video.
            </p>
            <div className="portfolio-actions">
              <a href="#portfolio" className="neo-button portfolio-button portfolio-button-primary">
                Explore the videos <ArrowDown size={18} aria-hidden="true" />
              </a>
              <Link to="/pricing" className="neo-button portfolio-button">
                Shop editing packs <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>
      <PortfolioSection full sections={portfolioSections} />
      <section className="portfolio-packs" aria-labelledby="portfolio-packs-title">
        <div className="portfolio-container">
          <div className="portfolio-packs-panel">
            <div className="portfolio-packs-copy">
              <p className="portfolio-kicker"><Layers3 size={18} aria-hidden="true" /> Your next video starts here</p>
              <h2 id="portfolio-packs-title">Your footage.<br />Our next edit.</h2>
              <p className="portfolio-description">
                Put these ideas to work for your channel. Choose an editing pack
                that fits your publishing schedule, and let us handle the cut.
              </p>
              <ul className="portfolio-packs-benefits">
                {["Clear monthly scope", "Thumbnails included", "Room for your feedback"].map((benefit) => (
                  <li key={benefit}><Check size={17} aria-hidden="true" />{benefit}</li>
                ))}
              </ul>
            </div>
            <div className="portfolio-packs-action">
              <span className="portfolio-pack-icon" aria-hidden="true"><Layers3 size={32} strokeWidth={1.5} /></span>
              {startingPrice !== null ? <>
                <p>Monthly editing packs from</p>
                <p className="portfolio-packs-price">{formatPackagePrice(startingPrice)}<span>/month</span></p>
              </> : <p>Explore our single-video and monthly editing packages.</p>}
              <Link to="/pricing" className="neo-button portfolio-button portfolio-button-primary">
                Shop editing packs <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              <Link to="/contact" className="portfolio-text-link">Need help choosing a pack?</Link>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
