import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { ProjectLibrary } from "../components/ProjectLibrary";
import { sendReviewForm } from "../lib/review-upload-client";
import {
  isMissingReviewSchema,
  loadAssignedProjects,
  loadReviewEditorOptions,
  loadReviewTeamSummaries,
  requireReviewActor,
} from "../lib/project-review.server";
import { getPositivePage } from "../lib/admin-data-requirements";
import type { ReviewEditorOption } from "../lib/project-review";
export const meta: MetaFunction = () => [
  { title: "Projects & assignments | EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];
export function headers() {
  return { "Cache-Control": "no-store" };
}
export async function loader(args: LoaderFunctionArgs) {
  const { db, actor } = await requireReviewActor(args, true),
    url = new URL(args.request.url),
    query = (url.searchParams.get("q") || "").trim().slice(0, 120),
    view = url.searchParams.get("view") || "all";
  let queue = await loadAssignedProjects(
      db,
      actor,
      query,
      view,
      getPositivePage(url.searchParams.get("page")),
    ),
    ready = true,
    editors: ReviewEditorOption[] = [],
    teams: Awaited<ReturnType<typeof loadReviewTeamSummaries>> = {};
  try {
    [editors, teams] = await Promise.all([
      loadReviewEditorOptions(db),
      loadReviewTeamSummaries(
        db,
        actor,
        queue.projects.map((project) => project.id),
      ),
    ]);
  } catch (error) {
    if (!isMissingReviewSchema(error)) throw error;
    ready = false;
    if (view === "unassigned")
      queue = await loadAssignedProjects(db, actor, query, "all", 1);
  }
  return { ...queue, actor, editors, teams, ready };
}
export default function AdminProjectsQueue() {
  const data = useLoaderData<typeof loader>(),
    revalidator = useRevalidator();
  return (
    <AdminPanelShell
      title="Projects"
      activeTab="projects"
      account={{ name: data.actor.name, detail: "Administrator" }}
      headerActions={
        <Link className="review-button" to="/site/node-logmin/video-storage">
          Video storage
        </Link>
      }
    >
      <section id="your-projects" className="project-review">
        <header className="review-project-heading">
          <div>
            <h1>Keep every project moving.</h1>
            <p>Assign an editor, review progress, and follow the next cut.</p>
          </div>
          <Link className="review-button" to="/site/node-logmin?tab=projects">
            Billing & status
          </Link>
        </header>
        {!data.ready ? (
          <div className="review-notice" role="status">
            Editor assignments and video uploads are being set up. Project
            briefs and shared file links are available now.
          </div>
        ) : null}
        <ProjectLibrary
          projects={data.projects}
          total={data.count}
          page={data.page}
          pageCount={data.pageCount}
          staff
          manager
          basePath="/site/node-logmin/projects"
          editors={data.editors}
          teams={data.teams}
          assignmentReady={data.ready}
          onAssign={async (id, form) => {
            const result = await sendReviewForm(
              `/api/project-reviews/${id}?scope=admin`,
              form,
            );
            if (!result.error) await revalidator.revalidate();
            return result;
          }}
        />
      </section>
    </AdminPanelShell>
  );
}
