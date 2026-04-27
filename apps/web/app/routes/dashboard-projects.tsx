import { createProject, listProjectsForOwner } from "@edicut/db";
import { projectInputSchema, slugifyProjectTitle } from "@edicut/shared";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { requireRole } from "../lib/auth.server";
import { resolveWebDb } from "../lib/context.server";
import type { LoaderContext } from "../types";

type ActionData = {
  error?: string;
};

export async function loader({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const user = await requireRole(request, context, ["admin"]);
  const projects = await listProjectsForOwner(resolveWebDb(context), user.id).catch(() => []);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    projects,
  };
}

export async function action({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const user = await requireRole(request, context, ["admin"]);

  if (!context) {
    return { error: "Project management is unavailable without runtime context." } satisfies ActionData;
  }

  const formData = await request.formData();

  const parsed = projectInputSchema.safeParse({
    title: String(formData.get("title") || ""),
    category: String(formData.get("category") || ""),
    summary: String(formData.get("summary") || ""),
    status: String(formData.get("status") || "draft"),
    featured: String(formData.get("featured") || "") === "on",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid project input.",
    } satisfies ActionData;
  }

  const slug = slugifyProjectTitle(parsed.data.title);

  if (!slug) {
    return { error: "The project title could not be converted into a valid slug." } satisfies ActionData;
  }

  await createProject(resolveWebDb(context), {
    ...parsed.data,
    ownerId: user.id,
    slug,
  }).catch(() => {
    throw new Error("Failed to create project.");
  });

  return redirect("/dashboard/projects");
}

export default function DashboardProjectsRoute() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData() as ActionData | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <main className="content-shell">
      <section className="panel page-hero">
        <p className="eyebrow">Admin Project Flow</p>
        <h1 className="page-title">Manage portfolio content directly in the Cloudflare app.</h1>
        <p className="lede">
          This is the first real content workflow in the new stack. The same `projects` table now
          powers the public portfolio page and the protected admin entry form.
        </p>
      </section>

      <section className="dashboard-grid">
        <section className="panel auth-card">
          <h2 className="section-title">Create Project</h2>
          <Form className="auth-form" method="post">
            <label className="field">
              <span>Title</span>
              <input name="title" placeholder="Campaign story title" type="text" />
            </label>
            <label className="field">
              <span>Category</span>
              <input name="category" placeholder="Commercial, Wedding, Creator" type="text" />
            </label>
            <label className="field">
              <span>Summary</span>
              <textarea name="summary" placeholder="Describe the cut, pacing, and deliverables." rows={5} />
            </label>
            <label className="field">
              <span>Status</span>
              <select defaultValue="draft" name="status">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input name="featured" type="checkbox" />
              <span>Feature this project on the homepage</span>
            </label>
            {actionData?.error ? <p className="form-error">{actionData.error}</p> : null}
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Creating..." : "Create Project"}
            </button>
          </Form>
        </section>

        <section className="panel projects">
          <h2 className="section-title">Your Projects</h2>
          {data.projects.length ? (
            <div className="stacked-list">
              {data.projects.map((project) => (
                <article className="stacked-item" key={project.id}>
                  <div>
                    <strong>{project.title}</strong>
                    <p>{project.summary}</p>
                  </div>
                  <div className="stacked-meta">
                    <span className="project-chip">{project.status}</span>
                    <span className="project-chip">{project.category}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No projects yet. Create the first one here and publish it to surface it on
              `/portfolio` and potentially on the homepage if featured.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
