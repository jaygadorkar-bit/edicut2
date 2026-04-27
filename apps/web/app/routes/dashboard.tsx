import { listFeaturedProjects } from "@edicut/db";
import { demoDashboardMetrics } from "@edicut/shared";
import { Link, useLoaderData } from "react-router";
import { requireUser } from "../lib/auth.server";
import { resolveWebDb } from "../lib/context.server";
import type { LoaderContext } from "../types";

export async function loader({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const user = await requireUser(request, context);
  const featuredProjects = await listFeaturedProjects(resolveWebDb(context)).catch(() => []);

  return {
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    },
    featuredProjects,
  };
}

export default function DashboardRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <main className="dashboard-shell">
      <section className="panel dashboard-hero">
        <p className="eyebrow">Protected route</p>
        <h1 className="dashboard-title">
          {data.user.name || data.user.email}, your Cloudflare session is live.
        </h1>
        <p className="lede">
          The dashboard loader is guarded directly in the Worker. If the signed cookie is missing
          or invalid, the route redirects to `/login` before rendering.
        </p>
        <div className="meta-grid">
          {demoDashboardMetrics.map((metric) => (
            <article className="meta-card" key={metric.label}>
              <p className="meta-label">{metric.label}</p>
              <p className="meta-value">{metric.value}</p>
            </article>
          ))}
        </div>
        <div className="dashboard-actions">
          <Link className="primary-button inline-action" to="/dashboard/projects">
            Manage Projects
          </Link>
          <Link className="ghost-button inline-action" to="/dashboard/packages">
            Manage Packages
          </Link>
          <Link className="ghost-button inline-action" to="/dashboard/security">
            Security Settings
          </Link>
        </div>
      </section>

      <section className="projects panel">
        <h2 className="section-title">Homepage feed snapshot</h2>
        {data.featuredProjects.length ? (
          <div className="project-grid">
            {data.featuredProjects.map((project) => (
              <article className="project-card" key={project.id}>
                <strong>{project.title}</strong>
                <p>{project.summary}</p>
                <span className="project-chip">{project.category}</span>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">Feature a project from the admin flow to populate this dashboard block.</div>
        )}
      </section>
    </main>
  );
}
