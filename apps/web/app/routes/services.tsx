import type { MetaFunction } from "react-router";
import { Link } from "react-router";
import { ArrowUpRight, Film, Gamepad2, Image, Mic2, Smartphone } from "lucide-react";
import { PageShell } from "../components/site/Marketing";
import { SERVICE_PAGES } from "../lib/services";
import { createRouteMeta, getCanonicalSiteOrigin, serializeJsonLd } from "../lib/seo";
import "../styles/services.css";

export const meta: MetaFunction = (args) => createRouteMeta(args,
  "Video Editing & YouTube Thumbnail Services | EdiCut",
  "Explore EdiCut services for YouTube videos, podcasts, Shorts, Reels, gaming, and thumbnails. Find the right editing approach for your next upload.",
);

const serviceIcons = [Film, Mic2, Smartphone, Gamepad2, Image];

export default function ServicesPage() {
  const origin = getCanonicalSiteOrigin();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${origin}/services#webpage`,
    name: "EdiCut video editing and thumbnail services",
    url: `${origin}/services`,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: SERVICE_PAGES.map((service, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: service.title,
        url: `${origin}/services/${service.slug}`,
      })),
    },
  };

  return (
    <PageShell className="services-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <div className="services-container">
        <nav className="services-breadcrumb" aria-label="Breadcrumb">
          <ol><li><Link to="/">Home</Link></li><li aria-current="page">Services</li></ol>
        </nav>
        <section className="services-hero" aria-labelledby="services-title">
          <div>
            <h1 id="services-title">Video editing for the way you create.</h1>
            <p className="services-lead">A YouTube story, a long conversation, a moment worth clipping. Explore the work behind each format and find the right approach for your next upload.</p>
            <div className="services-actions">
              <Link to="/pricing" className="neo-button neo-button--primary">Explore editing packages</Link>
              <Link to="/portfolio" className="services-text-link">See the portfolio</Link>
            </div>
          </div>
          <aside className="services-hero-note" aria-label="How to choose an editing service">
            <h2>Start with your footage.</h2>
            <p>Tell us what you are making, how much material you have, and where it will be published. We can help you choose a scope that fits.</p>
            <Link to="/contact" className="services-text-link">Discuss your project <ArrowUpRight size={17} aria-hidden="true" /></Link>
          </aside>
        </section>
        <section className="services-directory" aria-labelledby="services-directory-title">
          <h2 id="services-directory-title">Explore our services</h2>
          <div>
            {SERVICE_PAGES.map((service, index) => {
              const Icon = serviceIcons[index] ?? Film;
              return (
                <article className="services-directory-item" key={service.slug}>
                  <span className="services-format-icon" aria-hidden="true"><Icon size={25} strokeWidth={1.6} /></span>
                  <div className="services-directory-copy">
                    <h3><Link to={`/services/${service.slug}`}>{service.title}<ArrowUpRight size={22} aria-hidden="true" /></Link></h3>
                    <p>{service.summary}</p>
                  </div>
                  <p className="services-directory-format">{service.format}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="services-closing" aria-labelledby="services-closing-title">
          <div><h2 id="services-closing-title">One upload or a regular publishing rhythm?</h2><p>Compare the current editing packages and their footage, length, and revision allowances. For a different brief, talk with the team before choosing.</p></div>
          <Link to="/pricing" className="neo-button neo-button--primary">Compare packages</Link>
        </section>
      </div>
    </PageShell>
  );
}
