import { useMemo, useState } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Link, useLoaderData } from "react-router";
import { ArrowUpRight, CalendarDays, FolderOpen, Mail, Search } from "lucide-react";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { Select } from "../components/Select";
import { clientNavigation } from "../lib/client-workspace-navigation";
import { requireClientWorkspace } from "../lib/client-workspace-access.server";
import { loadManagerClientDirectory } from "../lib/manager-workspace.server";
import type { ReviewActor } from "../lib/project-review";
import { isMissingReviewSchema } from "../lib/project-review.server";
import { isMissingWorkspaceSchema } from "../lib/workspace";
import { createChatStore } from "../lib/chat-store.server";
import { importMissingClientProjectManagers } from "../lib/client-project-managers.server";
import { projectStatusLabel } from "../lib/project-review";

export const meta: MetaFunction = () => [
  { title: "Assigned clients | EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" }; }

export async function loader(args: LoaderFunctionArgs) {
  const { db, user, features } = await requireClientWorkspace(args);
  if (user.role !== "project_manager") throw new Response("Project manager access required.", { status: 403 });
  const actor: ReviewActor = { id: user.id, key: `user:${user.id}`, name: user.name || "Manager", role: user.role, admin: false };

  try {
    const chat = createChatStore(db, args.context);
    await importMissingClientProjectManagers(db, actor, await chat.listLegacyClientManagerAssignments(actor));
    return { user, features, clients: await loadManagerClientDirectory(db, actor, features.includes("reviews")), ready: true };
  } catch (error) {
    if (!isMissingReviewSchema(error) && !isMissingWorkspaceSchema(error)) throw error;
    return { user, features, clients: [], ready: false };
  }
}

function formatDate(value: string | Date | null) {
  if (!value) return "No project activity yet";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "No project activity yet";
  return date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

export default function ManagerClientsRoute() {
  const { user, features, clients, ready } = useLoaderData<typeof loader>();
  const reviewsEnabled = features.includes("reviews");
  const [query, setQuery] = useState("");
  const [clientView, setClientView] = useState<"all" | "active" | "reviews" | "no-projects">("all");
  const [sortBy, setSortBy] = useState<"activity" | "name" | "projects">("activity");
  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return clients
      .filter((client) => {
        const matchesQuery = !normalized || `${client.name} ${client.email}`.toLowerCase().includes(normalized);
        const matchesView = clientView === "all"
          || (clientView === "active" && client.activeProjectCount > 0)
          || (clientView === "reviews" && client.reviewCount > 0)
          || (clientView === "no-projects" && client.projectCount === 0);
        return matchesQuery && matchesView;
      })
      .sort((first, second) => {
        if (sortBy === "name") return first.name.localeCompare(second.name);
        if (sortBy === "projects") return second.projectCount - first.projectCount || first.name.localeCompare(second.name);
        const firstActivity = first.lastActivity ? new Date(first.lastActivity).valueOf() : 0;
        const secondActivity = second.lastActivity ? new Date(second.lastActivity).valueOf() : 0;
        return secondActivity - firstActivity || first.name.localeCompare(second.name);
      });
  }, [clients, clientView, query, sortBy]);
  const clientViewCounts = {
    all: clients.length,
    active: clients.filter((client) => client.activeProjectCount > 0).length,
    reviews: reviewsEnabled ? clients.filter((client) => client.reviewCount > 0).length : 0,
    "no-projects": clients.filter((client) => client.projectCount === 0).length,
  };
  const totals = clients.reduce((summary, client) => ({
    projects: summary.projects + client.projectCount,
    active: summary.active + client.activeProjectCount,
    reviews: summary.reviews + client.reviewCount,
  }), { projects: 0, active: 0, reviews: 0 });

  return (
    <WorkspaceShell
      title="Clients"
      navItems={clientNavigation(features, user.role)}
      account={{ name: user.name || user.email, detail: "Project manager", imageUrl: user.profileImageUrl }}
      mobileMenu
      navigationFeedback
      profileTo={features.includes("settings") ? "/dashboard/profile" : null}
      profileNavAtBottom
      settingsTo={features.includes("settings") ? "/dashboard/settings" : null}
      notificationsTo={reviewsEnabled ? "/dashboard/reviews" : null}
      notificationCount={reviewsEnabled ? totals.reviews : 0}
    >
      <div className="min-w-0 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="neo-workspace__eyebrow">Manager workspace</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#17202a]">Assigned clients</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">Client contact details, active projects, and recent work assigned to you.</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="relative min-w-0 flex-1 sm:w-64">
              <span className="sr-only">Search assigned clients</span>
              <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#728093]" />
              <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} type="search" placeholder="Search clients…" className="neo-workspace__profile-input h-11 w-full rounded-xl pl-9 pr-3 text-sm" />
            </label>
            <div className="flex min-h-11 min-w-0 items-center gap-2 text-xs font-bold text-[#687583]">
              <label id="clients-sort-label" className="shrink-0">Sort by</label>
              <Select aria-labelledby="clients-sort-label" value={sortBy} onChange={(event) => setSortBy(event.currentTarget.value as typeof sortBy)} className="min-w-0 text-sm font-bold text-[#334456]">
                <option value="activity">Recent activity</option>
                <option value="name">Client name</option>
                <option value="projects">Most projects</option>
              </Select>
            </div>
          </div>
        </header>

        {!ready ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="status">Client project data is waiting for a database migration. Please try again later.</p> : null}

        <section className={`grid gap-3 ${reviewsEnabled ? "sm:grid-cols-3" : "sm:grid-cols-2"}`} aria-label="Assigned client summary">
          <SummaryCard label="Assigned clients" value={clients.length} detail="Active client accounts" />
          <SummaryCard label="Active projects" value={totals.active} detail={`${totals.projects} projects across your clients`} />
          {reviewsEnabled ? <SummaryCard label="Ready for review" value={totals.reviews} detail="Cuts that need a review follow-up" /> : null}
        </section>

        <section aria-label="Filter clients" className="flex flex-wrap items-center gap-2">
          {([
            ["all", "All clients"],
            ["active", "Active work"],
            ...(reviewsEnabled ? [["reviews", "Ready for review"] as const] : []),
            ["no-projects", "No projects"],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={clientView === value} onClick={() => setClientView(value)} className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8] ${clientView === value ? "border-[#6d55e8] bg-[#f0ecfb] text-[#5141a9]" : "border-[#dce3ea] bg-white text-[#536779] hover:border-[#9e91d8]"}`}>
              {label}<span className="rounded-full bg-black/5 px-2 py-0.5 tabular-nums">{clientViewCounts[value]}</span>
            </button>
          ))}
          <p className="ml-auto text-xs font-semibold text-[#687583]" role="status" aria-live="polite">Showing {filteredClients.length} of {clients.length} clients</p>
        </section>

        <section className="grid gap-4 xl:grid-cols-2" aria-label="Client directory">
          {!ready ? (
            <div className="neo-workspace__panel rounded-[22px] p-6 sm:col-span-2" role="status">
              <h3 className="text-base font-black text-[#17202a]">Client directory is unavailable</h3>
              <p className="mt-2 text-sm leading-6 text-[#687583]">The assigned-client data will appear when its database setup is ready.</p>
            </div>
          ) : filteredClients.length ? filteredClients.map((client) => (
            <article key={client.id} className="neo-workspace__panel min-w-0 rounded-[22px] p-5 sm:p-6">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-black text-[#17202a]">{client.name}</h3>
                  <a href={`mailto:${client.email}`} className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-sm font-semibold text-[#536779] underline decoration-[#cbd5df] underline-offset-4 hover:text-[#5141a9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">
                    <Mail size={14} aria-hidden="true" />{client.email}
                  </a>
                </div>
                <span className="rounded-full bg-[#f1f4f7] px-3 py-1.5 text-xs font-black text-[#536779]">{client.projectCount} {client.projectCount === 1 ? "project" : "projects"}</span>
              </header>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <p className="rounded-xl bg-[#f6f8fa] px-3 py-2 text-[#687583]"><strong className="text-[#17202a]">{client.activeProjectCount}</strong> active</p>
                {reviewsEnabled ? <p className="rounded-xl bg-[#f6f8fa] px-3 py-2 text-[#687583]"><strong className="text-[#17202a]">{client.reviewCount}</strong> ready for review</p> : null}
              </div>

              <div className="mt-4 flex items-center gap-2 text-xs text-[#687583]">
                <CalendarDays size={14} aria-hidden="true" />
                <span>Last project activity: {formatDate(client.lastActivity)}</span>
              </div>

              <div className="mt-5 border-t border-[#edf0f2] pt-4">
                <h4 className="text-xs font-black uppercase tracking-wide text-[#73808b]">Recent projects</h4>
                {client.recentProjects.length ? (
                  <ul className="mt-2 divide-y divide-[#edf0f2]">
                    {client.recentProjects.map((project) => (
                      <li key={project.id}>
                        {reviewsEnabled ? <Link to={`/dashboard/projects/${project.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">
                          <span className="min-w-0 truncate text-sm font-bold text-[#334456]">{project.title}</span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full bg-[#f0ecfb] px-2.5 py-1 text-[10px] font-bold text-[#5141a9]">{projectStatusLabel(project.status)}</span>
                            <ArrowUpRight size={14} className="text-[#687583]" aria-hidden="true" />
                          </span>
                        </Link> : <div className="flex min-h-12 items-center justify-between gap-3 py-2"><span className="min-w-0 truncate text-sm font-bold text-[#334456]">{project.title}</span><span className="rounded-full bg-[#f0ecfb] px-2.5 py-1 text-[10px] font-bold text-[#5141a9]">{projectStatusLabel(project.status)}</span></div>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-sm text-[#687583]">No projects assigned yet.</p>}
              </div>

              {!client.recentProjects.length ? <Link to="/dashboard/projects" className="mt-4 inline-flex min-h-10 items-center gap-2 text-xs font-black text-[#5141a9] underline underline-offset-4">Open projects <FolderOpen size={14} aria-hidden="true" /></Link> : null}
            </article>
          )) : (
            <div className="neo-workspace__panel rounded-[22px] p-6 sm:col-span-2">
              <h3 className="text-base font-black text-[#17202a]">{clients.length ? (query.trim() ? "No clients match this search" : "No clients in this filter") : "No clients are assigned to you yet"}</h3>
              <p className="mt-2 text-sm leading-6 text-[#687583]">{clients.length ? "Try another search or client filter." : "When the team assigns a client to you, their contact details and projects will appear here."}</p>
              {clients.length ? <button type="button" onClick={() => { setQuery(""); setClientView("all"); }} className="mt-3 inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-black text-[#5141a9] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">Clear search and filters</button> : null}
            </div>
          )}
        </section>
      </div>
    </WorkspaceShell>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <article className="neo-workspace__panel rounded-2xl p-4"><p className="text-xs font-bold text-[#687583]">{label}</p><p className="mt-2 text-2xl font-black tabular-nums text-[#17202a]">{value}</p><p className="mt-1 text-xs leading-5 text-[#687583]">{detail}</p></article>;
}
