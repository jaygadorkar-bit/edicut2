import { Form, Link, useSearchParams } from "react-router";
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Clapperboard,
  FileText,
  FolderOpen,
  Search,
} from "lucide-react";
import {
  projectBriefSections,
  projectStatusLabel,
  type ReviewProject,
  type ReviewTeamMember,
  type ReviewEditorOption,
  type ReviewResult,
} from "../lib/project-review";
import { ProjectAssignment } from "./ProjectAssignment";
import "../styles/project-review.css";

export function ProjectLibrary({
  projects,
  total,
  page = 1,
  pageCount = 1,
  staff = false,
  manager = false,
  basePath = "/dashboard/projects",
  teams = {},
  editors = [],
  assignmentReady = false,
  onAssign,
}: {
  projects: ReviewProject[];
  total: number;
  page?: number;
  pageCount?: number;
  staff?: boolean;
  manager?: boolean;
  basePath?: string;
  teams?: Record<string, { members: ReviewTeamMember[]; revision: number }>;
  editors?: ReviewEditorOption[];
  assignmentReady?: boolean;
  onAssign?: (projectId: string, form: FormData) => Promise<ReviewResult>;
}) {
  const [params] = useSearchParams();
  const requestedView = params.get("view") || "all";
  const view = [
    "all",
    "active",
    "reviews",
    "delivered",
    ...(manager ? ["unassigned"] : []),
  ].includes(requestedView)
    ? requestedView
    : "all";
  function toPage(next: number, selectedView = view) {
    const query = new URLSearchParams(params);
    query.set("page", String(next));
    if (selectedView === "all") query.delete("view");
    else query.set("view", selectedView);
    return `?${query}#your-projects`;
  }
  const stages = ["Brief", "Editing", "Review", "Delivered"];
  return (
    <div className="project-library">
      <h2 id="your-projects-title" tabIndex={-1} className="sr-only">
        Projects
      </h2>
      <div className="project-library__toolbar">
        <nav aria-label="Project filters">
          {[
            ["all", "All projects"],
            ...(manager ? [["unassigned", "Needs editor"]] : []),
            ["active", "In progress"],
            ["reviews", "Ready for review"],
            ["delivered", "Delivered"],
          ].map(([value, label]) => (
            <Link
              key={value}
              to={toPage(1, value)}
              aria-current={view === value ? "page" : undefined}
              className={view === value ? "is-active" : ""}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Form method="get" role="search" className="project-library__search">
          <Search size={16} aria-hidden="true" />
          <label className="sr-only" htmlFor="project-search">
            Search projects
          </label>
          <input
            id="project-search"
            name="q"
            type="search"
            maxLength={120}
            defaultValue={params.get("q") ?? ""}
            key={params.get("q") ?? ""}
            placeholder="Search projects…"
            autoComplete="off"
          />
          {view !== "all" ? (
            <input type="hidden" name="view" value={view} />
          ) : null}
          <button type="submit" aria-label="Search projects">
            <ArrowRight size={15} />
          </button>
        </Form>
      </div>
      {projects.length ? (
        <div className="project-library__grid">
          {projects.map((project) => {
            const stage =
              project.status === "delivered"
                ? 3
                : ["review", "client_review", "revision"].includes(
                      project.status,
                    )
                  ? 2
                  : project.status === "editing"
                    ? 1
                    : 0;
            const review = ["review", "client_review"].includes(project.status);
            const objective = project.notes?.match(
              /Goal:\s*([\s\S]*?)(?:\n\n|$)/,
            )?.[1];
            const runtime = project.notes?.match(
              /Finished runtime:\s*([^\n]+)/,
            )?.[1];
            return (
              <article
                key={project.id}
                className={`project-card ${review ? "project-card--review" : ""}`}
              >
                <header>
                  <span
                    className={`project-card__icon project-card__icon--${project.status}`}
                  >
                    <Clapperboard
                      size={24}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </span>
                  <span
                    className={`review-status review-status--${project.status}`}
                  >
                    {projectStatusLabel(project.status)}
                  </span>
                </header>
                <h3>
                  <Link to={`${basePath}/${project.id}`}>{project.title}</Link>
                </h3>
                <p className="project-card__creator">
                  {project.channelName}
                  {runtime ? <span>{runtime}</span> : null}
                </p>
                {manager && onAssign ? (
                  <ProjectAssignment
                    compact
                    title={project.title}
                    members={teams[project.id]?.members ?? []}
                    editors={editors}
                    revision={teams[project.id]?.revision ?? 0}
                    canAssign
                    ready={assignmentReady}
                    onSubmit={(form) => onAssign(project.id, form)}
                  />
                ) : null}
                <p className="project-card__description">
                  {review
                    ? "Your latest cut is ready. Watch it and leave feedback at the moments that matter."
                    : objective ||
                      (stage === 0
                        ? "Your brief is with the team. We’ll confirm the next steps after reviewing your files."
                        : stage === 1
                          ? "Your editor is bringing the brief to life. Review versions and feedback in the project workspace."
                          : stage === 3
                            ? "The final cut is approved. Your versions and feedback are saved in the project workspace."
                            : "Your feedback is with the editor. Follow the next version from the project workspace.")}
                </p>
                <ol
                  className="project-card__progress"
                  aria-label={`Project progress: ${projectStatusLabel(project.status)}`}
                >
                  {stages.map((label, index) => (
                    <li
                      key={label}
                      className={index <= stage ? "is-complete" : ""}
                      aria-current={index === stage ? "step" : undefined}
                    >
                      <span />
                      <small>{label}</small>
                    </li>
                  ))}
                </ol>
                <div className="project-card__delivery">
                  <CalendarDays size={15} aria-hidden="true" />
                  <span>
                    {project.deadline ? (
                      <>
                        Target delivery{" "}
                        <strong>
                          {new Date(
                            `${project.deadline}T00:00:00Z`,
                          ).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </strong>
                      </>
                    ) : (
                      "Delivery date to be confirmed"
                    )}
                  </span>
                </div>
                <footer>
                  <Link
                    to={`${basePath}/${project.id}`}
                    className={`review-button ${review ? "review-button--primary" : ""}`}
                  >
                    {review ? "Review latest cut" : "Open project"}
                    <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                  <details className="project-card__brief">
                    <summary>
                      <FileText size={15} aria-hidden="true" />
                      Brief
                      <ChevronDown size={13} aria-hidden="true" />
                    </summary>
                    <div>
                      <strong>Submitted brief</strong>
                      <dl>
                        {projectBriefSections(project.notes).map(
                          (section, index) => (
                            <div key={index}>
                              <dt>{section.label}</dt>
                              <dd>{section.value}</dd>
                            </div>
                          ),
                        )}
                      </dl>
                      <Link to={`${basePath}/${project.id}`}>
                        Open full project
                        <ArrowRight size={13} />
                      </Link>
                    </div>
                  </details>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="project-library__empty">
          <FolderOpen size={38} strokeWidth={1.3} />
          <h3>
            {params.get("q")
              ? "No projects match your search"
              : view === "reviews"
                ? "You’re all caught up"
                : staff
                  ? "No assigned projects yet"
                  : "Your next video starts here"}
          </h3>
          <p>
            {params.get("q")
              ? "Try a different project name, or clear the search."
              : view === "reviews"
                ? "When a new cut is ready, it will appear here for your feedback."
                : staff
                  ? "An administrator can add you to a project’s team. Assigned projects will appear here."
                  : "Choose Start project to share your idea and get your first edit underway."}
          </p>
          {view !== "all" || params.get("q") ? (
            <Link to="/dashboard/projects" className="review-button">
              View all projects
            </Link>
          ) : null}
        </div>
      )}
      {pageCount > 1 ? (
        <nav className="project-library__pagination" aria-label="Project pages">
          {page > 1 ? (
            <Link to={toPage(page - 1)} className="review-button">
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link to={toPage(page + 1)} className="review-button">
              Next
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
