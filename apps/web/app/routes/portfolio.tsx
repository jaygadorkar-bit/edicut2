import { listPublishedProjects } from "@edicut/db";
import { useLoaderData } from "react-router";
import { resolveWebDb } from "../lib/context.server";
import type { LoaderContext } from "../types";

export async function loader({ context }: { context?: LoaderContext }) {
  const projects = await listPublishedProjects(resolveWebDb(context)).catch(() => []);

  return { projects };
}

export default function PortfolioRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <main className="public-page">
      <section className="panel public-hero">
        <p className="eyebrow">Portfolio</p>
        <h1 className="public-title">
          The restored showcase puts
          <br />
          the work front and center
        </h1>
        <p className="public-copy">
          This portfolio keeps the current shared-data loader, but presents it with the darker
          studio-style UI from the earlier Edicut experience.
        </p>
      </section>

      <section className="public-filter-row">
        <span className="active">All</span>
        <span>YouTube</span>
        <span>Commercial</span>
        <span>Short Form</span>
        <span>Brand Content</span>
      </section>

      <section className="public-portfolio-grid">
        {data.projects.length ? (
          data.projects.map((project, index) => (
            <article
              className={`panel portfolio-card ${index % 3 === 0 ? "portfolio-card-large" : ""}`}
              key={project.id}
            >
              <div className="portfolio-card-media">
                <span>{project.category}</span>
              </div>
              <div className="portfolio-card-copy">
                <h2>{project.title}</h2>
                <p>{project.summary}</p>
              </div>
            </article>
          ))
        ) : (
          <>
            <article className="panel portfolio-card portfolio-card-large">
              <div className="portfolio-card-media">
                <span>Creator Documentary</span>
              </div>
              <div className="portfolio-card-copy">
                <h2>Long-form storytelling with stronger retention pacing</h2>
                <p>
                  No published projects are available yet, so the restored UI is showing a studio
                  showcase state until real entries are published from the dashboard.
                </p>
              </div>
            </article>
            <article className="panel portfolio-card">
              <div className="portfolio-card-media">
                <span>Podcast Repurposing</span>
              </div>
              <div className="portfolio-card-copy">
                <h2>One recording turned into a weekly content system</h2>
                <p>
                  Use the dashboard to publish portfolio items and this grid will populate
                  automatically.
                </p>
              </div>
            </article>
            <article className="panel portfolio-card">
              <div className="portfolio-card-media">
                <span>Product Breakdown</span>
              </div>
              <div className="portfolio-card-copy">
                <h2>Graphics-led cuts built for repeatable release cadence</h2>
                <p>The data wiring stays live even while the old front-end treatment is restored.</p>
              </div>
            </article>
          </>
        )}
      </section>
    </main>
  );
}
