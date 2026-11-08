import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, CalendarDays, Copy, Users } from "lucide-react";
import type { AffiliatePortalData } from "../../lib/marketing.server";
import type { ReviewEditorOption, ReviewProject } from "../../lib/project-review";
import { projectStatusLabel } from "../../lib/project-review";
import type { ManagerActionProject } from "../../lib/manager-workspace.server";

type StaffRole = "project_manager" | "editor";

type StaffOverviewProps = {
  role: StaffRole;
  projectsEnabled: boolean;
  reviewsEnabled: boolean;
  projects: ReviewProject[];
  projectCount: number;
  activeCount: number;
  reviewCount: number;
  deliveredCount: number;
  unassignedCount: number;
  editors: ReviewEditorOption[];
  managerTasks?: ManagerActionProject[];
};

type AffiliateOverviewProps = {
  affiliate: AffiliatePortalData | null;
  ready: boolean;
};

function OverviewStat({ label, value, detail, tone = "violet", to }: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "violet" | "teal" | "amber" | "slate";
  to?: string;
}) {
  const tones = {
    violet: "border-l-[#6d55e8]",
    teal: "border-l-[#1b9b8d]",
    amber: "border-l-[#d39231]",
    slate: "border-l-[#536779]",
  };

  const content = <>
      <p className="text-xs font-bold text-[#687583]">{label}</p>
      <p className="mt-2 text-2xl font-black tabular-nums text-[#17202a]">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[#687583]">{detail}</p>
  </>;

  return to ? (
    <Link to={to} aria-label={`${label}: ${value}. ${detail}`} className={`neo-workspace__panel group min-w-0 rounded-2xl border-l-4 ${tones[tone]} p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]`}>
      {content}
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-black text-[#5141a9]">Open list <ArrowRight size={14} aria-hidden="true" /></span>
    </Link>
  ) : (
    <article className={`neo-workspace__panel min-w-0 rounded-2xl border-l-4 ${tones[tone]} p-4`}>
      {content}
    </article>
  );
}

function formatDeadline(deadline: string | null) {
  if (!deadline) return "Date to be confirmed";
  const date = new Date(`${deadline}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return "Date to be confirmed";
  return date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" });
}

function ProjectQueue({ projects, title, emptyTitle, emptyCopy, manager = false }: {
  projects: ReviewProject[];
  title: string;
  emptyTitle: string;
  emptyCopy: string;
  manager?: boolean;
}) {
  return (
    <section className="neo-workspace__panel overflow-hidden rounded-[22px]" aria-labelledby="role-project-queue-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebf0] px-5 py-4">
        <div>
          <h2 id="role-project-queue-title" className="text-base font-black text-[#17202a]">{title}</h2>
          <p className="mt-1 text-xs text-[#687583]">Recently updated work you can access.</p>
        </div>
        <Link to={manager ? "/dashboard/projects?view=unassigned#your-projects" : "/dashboard/projects"} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dce3ea] px-4 text-xs font-black text-[#36495a] transition hover:border-[#6d55e8] hover:text-[#5141a9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">
          {manager ? "Open assignment board" : "Open my projects"}
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>
      {projects.length ? (
        <ul className="divide-y divide-[#edf0f2]">
          {projects.slice(0, 5).map((project) => (
            <li key={project.id}>
              <Link to={`/dashboard/projects/${project.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 transition hover:bg-[#f7f8fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#6d55e8]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-[#17202a]">{project.title}</span>
                  <span className="mt-1 block truncate text-xs text-[#687583]">{project.channelName || "Project"}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs">
                  <span className="rounded-full bg-[#f0ecfb] px-3 py-1 font-bold text-[#5141a9]">{projectStatusLabel(project.status)}</span>
                  <span className="inline-flex items-center gap-1 text-[#687583]"><CalendarDays size={14} aria-hidden="true" />{formatDeadline(project.deadline)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="px-5 py-8">
          <h3 className="text-sm font-black text-[#17202a]">{emptyTitle}</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#687583]">{emptyCopy}</p>
        </div>
      )}
    </section>
  );
}

function ManagerTaskQueue({ tasks }: { tasks: ManagerActionProject[] }) {
  const [filter, setFilter] = useState<"all" | "overdue" | "editor" | "review" | "revision" | "due-soon">("all");
  const taskFilters: { value: typeof filter; label: string; matches: (task: ManagerActionProject) => boolean }[] = [
    { value: "all", label: "All", matches: () => true },
    { value: "overdue", label: "Overdue", matches: (task) => task.nextAction === "Past target date" },
    { value: "editor", label: "Needs editor", matches: (task) => task.nextAction === "Assign an editor" },
    { value: "review", label: "Client review", matches: (task) => task.nextAction === "Follow up on client review" },
    { value: "revision", label: "Revisions", matches: (task) => task.nextAction === "Follow up on revision" },
    { value: "due-soon", label: "Due soon", matches: (task) => task.nextAction === "Delivery due soon" },
  ];
  const visibleTasks = tasks.filter((task) => taskFilters.find((item) => item.value === filter)?.matches(task) ?? true);

  return (
    <section className="neo-workspace__panel overflow-hidden rounded-[22px]" aria-labelledby="manager-task-queue-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebf0] px-5 py-4">
        <div>
          <h2 id="manager-task-queue-title" className="text-base font-black text-[#17202a]">Next actions</h2>
          <p className="mt-1 text-xs text-[#687583]">Projects that need a decision or follow-up.</p>
        </div>
        <Link to="/dashboard/projects?view=unassigned#your-projects" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dce3ea] px-4 text-xs font-black text-[#36495a] transition hover:border-[#6d55e8] hover:text-[#5141a9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">
          Open assignment board <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </header>
      {tasks.length ? (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-[#edf0f2] px-5 py-3" role="group" aria-label="Filter manager tasks">
            {taskFilters.map(({ value, label, matches }) => {
              const count = tasks.filter(matches).length;
              return (
                <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[11px] font-black transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8] ${filter === value ? "border-[#6d55e8] bg-[#f0ecfb] text-[#5141a9]" : "border-[#dce3ea] bg-white text-[#536779] hover:border-[#9e91d8]"}`}>
                  {label}<span className="rounded-full bg-black/5 px-1.5 py-0.5 tabular-nums">{count}</span>
                </button>
              );
            })}
            <p className="ml-auto text-xs text-[#687583]" role="status" aria-live="polite">{visibleTasks.length} of {tasks.length} actions</p>
          </div>
          {visibleTasks.length ? (
        <ul className="divide-y divide-[#edf0f2]">
          {visibleTasks.map((task) => {
            const overdue = task.nextAction === "Past target date";
            return (
              <li key={task.id}>
                <Link to={`/dashboard/projects/${task.id}`} className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 transition hover:bg-[#f7f8fb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#6d55e8]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-[#17202a]">{task.title}</span>
                    <span className="mt-1 block truncate text-xs text-[#687583]">{task.clientName} · {task.channelName || "Project"}</span>
                  </span>
                  <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                    <span className={`rounded-full px-3 py-1 font-bold ${overdue ? "bg-[#fff0ef] text-[#b42318]" : "bg-[#f0ecfb] text-[#5141a9]"}`}>{task.nextAction}</span>
                    <span className="inline-flex items-center gap-1 text-[#687583]"><CalendarDays size={14} aria-hidden="true" />{formatDeadline(task.deadline)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
          ) : (
            <div className="px-5 py-7">
              <h3 className="text-sm font-black text-[#17202a]">No actions in this filter</h3>
              <button type="button" onClick={() => setFilter("all")} className="mt-2 inline-flex min-h-10 items-center rounded-lg text-xs font-black text-[#5141a9] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">Show all actions</button>
            </div>
          )}
        </>
      ) : (
        <div className="px-5 py-8">
          <h3 className="text-sm font-black text-[#17202a]">No project follow-ups are due</h3>
          <p className="mt-1 max-w-xl text-sm leading-6 text-[#687583]">Assigned client projects will appear here when they need an editor, review, or delivery follow-up.</p>
        </div>
      )}
    </section>
  );
}

function ManagerOverview({ projectsEnabled, reviewsEnabled, projectCount, activeCount, reviewCount, unassignedCount, editors, managerTasks = [] }: StaffOverviewProps) {
  if (!projectsEnabled) {
    return (
      <section className="neo-workspace__panel rounded-[22px] p-6" role="status">
        <h2 className="text-lg font-black text-[#17202a]">Manager project access is unavailable</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">Ask an administrator to enable Projects for this account to open assigned clients and manage project work.</p>
      </section>
    );
  }

  const editorWorkload = [...editors].sort((first, second) =>
    (second.overdueProjects ?? 0) - (first.overdueProjects ?? 0) ||
    (second.dueSoonProjects ?? 0) - (first.dueSoonProjects ?? 0) ||
    (second.activeProjects ?? 0) - (first.activeProjects ?? 0) ||
    first.name.localeCompare(second.name),
  );
  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-5 rounded-[24px] bg-[#17202a] px-5 py-6 text-white sm:px-7">
        <div className="max-w-2xl">
          <p className="text-xs font-bold text-[#c6bedf]">Studio operations</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight !text-white sm:text-3xl">Keep the edit moving.</h2>
          <p className="mt-2 text-sm leading-6 text-[#d1d7dd]">{reviewsEnabled ? "Review the team queue, spot work waiting for an editor, and open assignments from one place." : "See your assigned clients and project activity. Reviews access is needed to open project details and manage assignments."}</p>
        </div>
        <Link to="/dashboard/clients" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-[#17202a] transition hover:bg-[#eeeafb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          View assigned clients <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Manager project summary">
        <OverviewStat label="Team projects" value={projectCount} detail="Projects in your manager workspace" to="/dashboard/projects" />
        <OverviewStat label="In progress" value={activeCount} detail="Not yet marked delivered" tone="teal" to="/dashboard/projects?view=active" />
        {reviewsEnabled ? <OverviewStat label="Ready for review" value={reviewCount} detail="Cuts awaiting client feedback" tone="amber" to="/dashboard/reviews" /> : null}
        {reviewsEnabled ? <OverviewStat label="Need an editor" value={unassignedCount} detail="Active projects without an editor" tone="slate" to="/dashboard/projects?view=unassigned#your-projects" /> : null}
      </section>

      {reviewsEnabled ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(260px,0.8fr)]">
          <ManagerTaskQueue tasks={managerTasks} />
          <section className="neo-workspace__panel rounded-[22px] p-5" aria-labelledby="editor-workload-title">
            <div className="flex items-center gap-2">
              <Users size={17} className="text-[#5141a9]" aria-hidden="true" />
              <h2 id="editor-workload-title" className="text-base font-black text-[#17202a]">Editor assignments</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-[#687583]">Workload is measured by projects assigned to your clients, with delivery dates as context.</p>
            {editors.length ? (
              <ul className="mt-4 max-h-72 divide-y divide-[#edf0f2] overflow-y-auto pr-2">
                {editorWorkload.map((editor) => (
                  <li key={editor.id} className="flex items-center justify-between gap-3 py-3">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-[#334456]">{editor.name}</span>
                      <span className="mt-1 block text-[11px] leading-4 text-[#687583]">{editor.dueSoonProjects ?? 0} due in 7 days</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-[#f1f4f7] px-3 py-1 text-xs font-black tabular-nums text-[#536779]">{editor.activeProjects ?? 0} active</span>
                      {editor.overdueProjects ? <span className="text-[11px] font-bold text-[#b42318]">{editor.overdueProjects} overdue</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-xl bg-[#f5f7f9] p-4 text-sm text-[#687583]">No active editor accounts are available for assignment.</p>
            )}
          </section>
        </div>
      ) : (
        <section className="neo-workspace__panel rounded-[22px] border-l-4 border-l-[#d39231] p-5" role="status">
          <h2 className="text-base font-black text-[#17202a]">Project actions are unavailable</h2>
          <p className="mt-1 text-sm leading-6 text-[#687583]">Reviews access is required to open project details, assign editors, and follow review work. Ask an administrator to enable Reviews for this account.</p>
        </section>
      )}
    </div>
  );
}

function EditorOverview({ projectsEnabled, reviewsEnabled, projects, projectCount, activeCount, reviewCount, deliveredCount }: StaffOverviewProps) {
  if (!projectsEnabled) {
    return (
      <section className="neo-workspace__panel rounded-[22px] p-6" role="status">
        <h2 className="text-lg font-black text-[#17202a]">Project access is unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-[#687583]">Ask an administrator to enable Projects for this account to open assigned work.</p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="neo-workspace__panel flex flex-wrap items-end justify-between gap-5 rounded-[24px] border-t-4 border-t-[#6d55e8] p-5 sm:px-7 sm:py-6">
        <div className="max-w-2xl">
          <p className="text-xs font-bold text-[#6955a4]">Editor workspace</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[#17202a] sm:text-3xl">Your edit queue.</h2>
          <p className="mt-2 text-sm leading-6 text-[#687583]">{reviewsEnabled ? "Open an assigned project to review its brief, source links, latest cut, and feedback." : "Track project stages here. Reviews access is needed to open project details and video feedback."}</p>
        </div>
        <Link to="/dashboard/projects" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#6d55e8] px-4 text-sm font-black text-white transition hover:bg-[#5842cf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">
          View assigned work <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Editor project summary">
        <OverviewStat label="Assigned projects" value={projectCount} detail="Projects assigned to your account" />
        <OverviewStat label="In progress" value={activeCount} detail="Still moving through production" tone="teal" />
        {reviewsEnabled ? <OverviewStat label="Ready for review" value={reviewCount} detail="Latest cuts awaiting feedback" tone="amber" /> : null}
        <OverviewStat label="Delivered" value={deliveredCount} detail="Completed assigned projects" tone="slate" />
      </section>

      {reviewsEnabled ? <ProjectQueue projects={projects} title="Your assigned projects" emptyTitle="No projects assigned yet" emptyCopy="When a project manager assigns work to you, the brief and project files will appear here." /> : (
        <section className="neo-workspace__panel rounded-[22px] border-l-4 border-l-[#d39231] p-5" role="status">
          <h2 className="text-base font-black text-[#17202a]">Project details are unavailable</h2>
          <p className="mt-1 text-sm leading-6 text-[#687583]">Reviews access is required to open project details and video feedback. Ask an administrator to enable Reviews for this account.</p>
        </section>
      )}
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function CopyReferralLink({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setFailed(false);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="grid min-w-0 gap-2 text-xs font-bold text-[#536779]" htmlFor="role-referral-link">
        Your referral link
        <input id="role-referral-link" readOnly value={value} onFocus={(event) => event.currentTarget.select()} className="neo-workspace__profile-input h-11 min-w-0 rounded-xl px-3 text-sm font-semibold" />
      </label>
      <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#dce3ea] px-4 text-sm font-black text-[#334456] transition hover:border-[#6d55e8] hover:text-[#5141a9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">
        <Copy size={15} aria-hidden="true" /> {copied ? "Copied" : "Copy link"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">{copied ? "Referral link copied." : failed ? "Could not copy the referral link. Select and copy it instead." : ""}</span>
    </div>
  );
}

function AffiliateOverview({ affiliate, ready }: AffiliateOverviewProps) {
  if (!ready) {
    return <section className="neo-workspace__panel rounded-[24px] p-6" role="status"><h2 className="text-lg font-black text-[#17202a]">Affiliate reporting is temporarily unavailable</h2><p className="mt-2 text-sm leading-6 text-[#687583]">The affiliate workspace will load when its database setup is available.</p></section>;
  }

  if (!affiliate) {
    return (
      <section className="neo-workspace__panel rounded-[24px] border-l-4 border-l-[#d39231] p-6 sm:p-7" aria-labelledby="affiliate-start-title">
        <p className="text-xs font-bold text-[#95600f]">Affiliate workspace</p>
        <h2 id="affiliate-start-title" className="mt-2 text-2xl font-black tracking-tight text-[#17202a]">Your partner profile is not active yet.</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">Request access or check the status of your application in the affiliate hub.</p>
        <Link to="/dashboard/affiliates" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#6d55e8] px-4 text-sm font-black text-white transition hover:bg-[#5842cf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">Open affiliate hub <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>
    );
  }

  const recentOrders = affiliate.orders.slice(0, 4);
  return (
    <div className="space-y-5">
      <section className="neo-workspace__panel rounded-[24px] border-t-4 border-t-[#1b9b8d] p-5 sm:p-7" aria-labelledby="affiliate-overview-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-[#28766d]">Partner workspace</p>
            <h2 id="affiliate-overview-title" className="mt-2 text-2xl font-black tracking-tight text-[#17202a] sm:text-3xl">Your referrals, clearly tracked.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">Share your link and follow attributed orders and commissions. Link visits are not counted in this report.</p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-black ${affiliate.active ? "bg-[#e8f7f2] text-[#24785e]" : "bg-[#f1f4f7] text-[#536779]"}`}>{affiliate.active ? "Program active" : "Program paused"}</span>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#536779]">
          <span>Referral code <strong className="ml-1 text-[#17202a]">{affiliate.code}</strong></span>
          <span>Commission rate <strong className="ml-1 text-[#17202a]">{(affiliate.commissionRateBps / 100).toFixed(2)}%</strong></span>
        </div>
        <div className="mt-4"><CopyReferralLink value={affiliate.referralUrl} /></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Affiliate performance summary">
        <OverviewStat label="Attributed orders" value={affiliate.orderCount} detail="Orders tied to your referral code" />
        <OverviewStat label="Paid orders" value={affiliate.paidOrderCount} detail="Orders confirmed as paid" tone="teal" />
        <OverviewStat label="Commission earned" value={formatMoney(affiliate.commissionEarnedCents)} detail="Recorded on paid orders" tone="slate" />
        <OverviewStat label="Pending estimate" value={formatMoney(affiliate.pendingCommissionCents)} detail="Estimated on unpaid orders" tone="amber" />
      </section>

      <section className="neo-workspace__panel overflow-hidden rounded-[22px]" aria-labelledby="affiliate-recent-orders-title">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebf0] px-5 py-4">
          <div><h2 id="affiliate-recent-orders-title" className="text-base font-black text-[#17202a]">Recent attributed orders</h2><p className="mt-1 text-xs text-[#687583]">Commission estimates become recorded when payment is confirmed.</p></div>
          <Link to="/dashboard/affiliates" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dce3ea] px-4 text-xs font-black text-[#36495a] transition hover:border-[#1b9b8d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]">Open affiliate hub <ArrowRight size={15} aria-hidden="true" /></Link>
        </header>
        {recentOrders.length ? (
          <ul className="divide-y divide-[#edf0f2]">
            {recentOrders.map((order) => (
              <li key={`${order.kind}-${order.id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm">
                <span className="min-w-0"><span className="block truncate font-bold text-[#334456]">{order.label}</span><span className="mt-1 block text-xs text-[#687583]">{order.kind === "project" ? "Project" : "Package order"} · {new Date(order.createdAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</span></span>
                <span className="shrink-0 text-right"><span className="block font-bold text-[#17202a]">{order.status === "paid" ? formatMoney(order.commissionCents) : order.pendingCommissionCents ? `${formatMoney(order.pendingCommissionCents)} estimated` : "Not earned"}</span><span className="mt-1 block text-xs capitalize text-[#687583]">{order.status.replaceAll("_", " ")}</span></span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-sm text-[#687583]">No attributed orders yet. Share your referral link to get started.</p>
        )}
      </section>
    </div>
  );
}

export function RoleDashboardOverview(props: StaffOverviewProps | AffiliateOverviewProps) {
  if ("affiliate" in props) return <AffiliateOverview {...props} />;
  return props.role === "project_manager" ? <ManagerOverview {...props} /> : <EditorOverview {...props} />;
}
