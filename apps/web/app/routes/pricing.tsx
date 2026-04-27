import { demoPricingPackages } from "@edicut/shared";
import { Link } from "react-router";

export default function PricingRoute() {
  return (
    <main className="public-page">
      <section className="panel public-hero">
        <p className="eyebrow">Pricing</p>
        <h1 className="public-title">
          Choose an editing tier,
          <br />
          keep the workflow moving
        </h1>
        <p className="public-copy">
          The backup UI presented pricing like a premium product catalog. This version restores
          that look while keeping the current Cloudflare route structure intact.
        </p>
      </section>

      <section className="public-pricing-grid">
        {demoPricingPackages.map((tier) => (
          <article
            className={`panel pricing-tier ${tier.id === "story-package" ? "featured" : ""}`}
            key={tier.id}
          >
            <p className="pricing-tier-kicker">
              {tier.status === "draft" ? "Custom Retainer" : "Popular Tier"}
            </p>
            <h2>{tier.name}</h2>
            <p className="pricing-tier-price">{tier.price}</p>
            <p className="pricing-tier-copy">{tier.detail}</p>
            <div className="pricing-tier-pills">
              <span>Fast turnaround</span>
              <span>Structured revisions</span>
              <span>Channel-ready delivery</span>
            </div>
            <div className="cinema-hero-cta">
              <Link className="primary-button" to="/contact">
                Book This Tier
              </Link>
              <Link className="ghost-button" to="/portfolio">
                View Work
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="public-two-up">
        <article className="panel public-story-card">
          <p className="eyebrow">For Bigger Pipelines</p>
          <h2>Need something more bespoke than a standard package?</h2>
          <p>
            For launch campaigns, recurring brand content, or multi-output creator systems, we can
            shape a more tailored post-production flow around your team.
          </p>
        </article>
        <article className="panel public-story-card">
          <p className="eyebrow">Shopping Questions</p>
          <h2>Comparing options should feel simple, not salesy.</h2>
          <p>
            Start with the tier that matches your volume and turnaround needs, then use contact for
            heavier graphics, custom pacing requirements, or a retainer-style workflow.
          </p>
        </article>
      </section>
    </main>
  );
}
