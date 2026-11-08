import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ArrowUpRight, Check } from "lucide-react";
import { PageShell } from "../components/site/Marketing";
import { getServiceBySlug } from "../lib/services";
import { createRouteMeta, getCanonicalSiteOrigin, serializeJsonLd } from "../lib/seo";
import "../styles/services.css";

export function loader({ params }: LoaderFunctionArgs) {
  const service = getServiceBySlug(params.slug);
  if (!service) throw new Response("Service not found", { status: 404 });
  return { service };
}

export const meta: MetaFunction<typeof loader> = (args) => createRouteMeta(args,
  args.loaderData?.service.metaTitle ?? "Service Not Found | EdiCut",
  args.loaderData?.service.description ?? "Explore EdiCut's video editing and thumbnail services.",
);

export default function ServicePage() {
  const { service } = useLoaderData<typeof loader>();
  const origin = getCanonicalSiteOrigin();
  const url = `${origin}/services/${service.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        "@id": `${url}#service`,
        name: service.title,
        serviceType: service.title,
        description: service.description,
        url,
        provider: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: "Services", item: `${origin}/services` },
          { "@type": "ListItem", position: 3, name: service.title, item: url },
        ],
      },
    ],
  };
  const relatedServices = service.relatedSlugs.map(getServiceBySlug).filter((item) => item !== undefined);

  return (
    <PageShell className="services-page service-detail-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }} />
      <div className="services-container">
        <nav className="services-breadcrumb" aria-label="Breadcrumb">
          <ol><li><Link to="/">Home</Link></li><li><Link to="/services">Services</Link></li><li aria-current="page">{service.title}</li></ol>
        </nav>
        <section className="services-hero service-detail-hero" aria-labelledby="service-title">
          <div>
            <h1 id="service-title">{service.heading ?? service.title}</h1>
            <p className="services-lead">{service.summary}</p>
            <div className="services-actions">
              <Link to="/contact" className="neo-button neo-button--primary">Discuss your project</Link>
              <Link to="/portfolio" className="services-text-link">Explore editing examples</Link>
            </div>
          </div>
          <aside className="services-hero-note" aria-label="Service overview">
            <dl className="services-overview"><div><dt>Format</dt><dd>{service.format}</dd></div><div><dt>Editing focus</dt><dd>{service.focus}</dd></div></dl>
          </aside>
        </section>
        <section className="services-section services-introduction" aria-labelledby="service-approach-title">
          <div><h2 id="service-approach-title">An edit built around your content.</h2><p className="services-audience">{service.audience}</p></div>
          <p>{service.introduction}</p>
        </section>
        <section className="services-section" aria-labelledby="service-work-title">
          <div className="services-section-heading"><h2 id="service-work-title">What we work on</h2><p>We agree on the deliverables and level of finishing before the project begins.</p></div>
          <div className="services-deliverables">
            {service.deliverables.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.description}</p></article>)}
          </div>
        </section>
        <section className="services-section services-preparation" aria-labelledby="service-brief-title">
          <div><h2 id="service-brief-title">A useful brief starts here.</h2><p>These details help the team assess your footage, understand your style, and set a realistic scope.</p><Link to="/contact" className="services-text-link">Get help with your brief <ArrowUpRight size={17} aria-hidden="true" /></Link></div>
          <ul>{service.preparation.map((item) => <li key={item}><Check size={19} aria-hidden="true" /><span>{item}</span></li>)}</ul>
        </section>
        <section className="services-section" aria-labelledby="service-process-title">
          <div className="services-section-heading"><h2 id="service-process-title">From brief to approval</h2><p>A shared direction, a review, and an agreed final delivery.</p></div>
          <ol className="services-process">{service.process.map((item) => <li key={item.title}><h3>{item.title}</h3><p>{item.description}</p></li>)}</ol>
        </section>
        <section className="services-section services-questions" aria-labelledby="service-questions-title">
          <h2 id="service-questions-title">Questions about {service.title.toLowerCase()}</h2>
          <div>{service.questions.map((item) => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</div>
        </section>
        <section className="services-closing" aria-labelledby="service-next-title">
          <div><h2 id="service-next-title">Make room for your next upload.</h2><p>See current packages, scope, and revision allowances, or share your brief for help choosing.</p></div>
          <div className="services-actions"><Link to="/pricing" className="neo-button neo-button--primary">View pricing</Link>{service.slug === "short-form-video-editing" ? <Link to="/pricing/short-form-video-editing" className="services-text-link">See the short-form package</Link> : null}<Link to="/contact" className="services-text-link">Talk with the team</Link></div>
        </section>
        <nav className="services-related" aria-label="Related services">
          <h2>Explore related services</h2>
          <ul>{relatedServices.map((item) => <li key={item.slug}><Link to={`/services/${item.slug}`}>{item.title}<ArrowUpRight size={18} aria-hidden="true" /></Link></li>)}</ul>
          <Link to="/services" className="services-text-link">View all services</Link>
        </nav>
      </div>
    </PageShell>
  );
}
