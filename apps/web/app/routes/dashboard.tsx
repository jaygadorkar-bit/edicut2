import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Link, redirect, useLoaderData } from "react-router";
import { count as drizzleCount, desc, eq, sql } from "drizzle-orm";
import { workspaceProjectFiles, workspaceProjects } from "@edicut/db/schema";
import { requireUserProfile, getSession, destroySession } from "../lib/session.server";
import { getDbFromContext } from "../lib/db.server";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import { canAccessDashboardFeature, getAllowedDashboardFeatures, getDashboardLandingPath, type DashboardFeature } from "../lib/role-feature-access";
import { loadAssignedProjectSummary, loadAssignedProjects, loadReviewEditorOptions, isMissingReviewSchema } from "../lib/project-review.server";
import type { ReviewActor, ReviewEditorOption, ReviewProject } from "../lib/project-review";
import { loadManagerActionQueue } from "../lib/manager-workspace.server";
import type { ManagerActionProject } from "../lib/manager-workspace.server";
import { getAffiliatePortalData, isMissingMarketingSchema, type AffiliatePortalData } from "../lib/marketing.server";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { ConfirmSignOutButton } from "../components/ConfirmSignOutButton";
import { RoleDashboardOverview } from "../components/dashboard/RoleDashboardOverviews";
import { isMissingWorkspaceSchema, WORKSPACE_MIGRATION_NOTICE } from "../lib/workspace";
import { workspaceProjectSummaryColumns, type WorkspaceProjectSummary } from "../lib/workspace-projects.server";
import { toPublicUser } from "../lib/admin-public";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { ClientBalance } from "../components/ClientBalance";
import { isMissingClientWorkspaceSchema, loadClientWorkspace } from "../lib/client-workspace.server";
import { createChatStore } from "../lib/chat-store.server";
import { importMissingClientProjectManagers } from "../lib/client-project-managers.server";
import { scheduleApplicationErrorCapture } from "../lib/application-error-log.server";
import { getRequestReference } from "../lib/request-reference";
import { retryDatabaseRead } from "../lib/database-errors";

const dashboardStages = ["session-profile", "role-feature-access", "customer-project-list", "customer-project-summary", "customer-file-count", "customer-projects", "client-balance", "staff-overview", "affiliate-overview"] as const;
type DashboardStage = typeof dashboardStages[number];

class DashboardStageError extends Error {
  constructor(readonly stage: DashboardStage, cause: unknown) {
    super(`Dashboard ${stage} stage failed`, { cause });
    this.name = "DashboardStageError";
  }
}

async function atDashboardStage<T>(stage: DashboardStage, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof DashboardStageError) throw error;
    if (error instanceof Response && error.status < 500) throw error;
    throw new DashboardStageError(stage, error);
  }
}

const navItems = [
  { label: "Dashboard", icon: "dashboard_customize", path: "/dashboard", feature: "overview" as DashboardFeature },
  { label: "Projects", icon: "video_library", path: "/dashboard/projects", feature: "projects" as DashboardFeature },
  { label: "Reviews", icon: "rate_review", path: "/dashboard/reviews", feature: "reviews" as DashboardFeature },
  { label: "Files", icon: "upload_file", path: "/dashboard/uploads", feature: "uploads" as DashboardFeature },
  { label: "Enquiries", icon: "mail", path: "/dashboard/messages", feature: "support" as DashboardFeature },
  { label: "Subscriptions", icon: "receipt_long", path: "/dashboard/subscriptions", feature: "billing" as DashboardFeature },
  { label: "Affiliates", icon: "hub", path: "/dashboard/affiliates", feature: "affiliates" as DashboardFeature },
];

const statusLabels: Record<string, string> = {
  intake: "Intake",
  editing: "Editing",
  review: "Ready for review",
  client_review: "Ready for review",
  revision: "Revision requested",
  delivered: "Delivered",
};

export const meta: MetaFunction = () => [
  { title: "Customer dashboard | EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" }; }

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  const formData = await readMutationForm(request, 4096);
  if (!formData) return { error: "Submit a valid workspace form under 4 KB." };
  if (formData.get("intent") !== "logout") return null;
  const session = await getSession(request.headers.get("Cookie"), context);
  return redirect("/signin?redirectTo=/dashboard", {
    headers: { "Set-Cookie": await destroySession(session, context) },
  });
}

async function loadDashboard({ request, context }: LoaderFunctionArgs) {
  const user = await atDashboardStage("session-profile", () => requireUserProfile(request, context));
  const userId = user.id;
  const db = getDbFromContext(context);
  const roleFeatureAccess = await atDashboardStage("role-feature-access", () => getRoleFeatureAccessSettings(db, context));

  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);

  if (allowedFeatures.length === 0) {
    return {
      user: toPublicUser(user),
      allowedFeatures,
      projects: [] as WorkspaceProjectSummary[],
      projectCount: 0,
      activeCount: 0,
      reviewCount: 0,
      deliveredCount: 0,
      fileCount: 0,
      workspaceReady: true,
      noDashboardAccess: true,
      clientBalance: null,
      balanceReady: true,
      assignedProjects: [] as ReviewProject[],
      unassignedProjectCount: 0,
      editors: [] as ReviewEditorOption[],
      managerTasks: [] as ManagerActionProject[],
      affiliateData: null as AffiliatePortalData | null,
      affiliateReady: true,
    };
  }

  if (!canAccessDashboardFeature(user.role, "overview", roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(allowedFeatures));
  }

  const canViewProjects = allowedFeatures.includes("projects");
  const canViewReviews = allowedFeatures.includes("reviews") && allowedFeatures.includes("projects");
  const canViewUploads = allowedFeatures.includes("uploads");
  const isStaff = user.role === "editor" || user.role === "project_manager";
  let projects: WorkspaceProjectSummary[] = [];
  let projectCount = 0;
  let activeCount = 0;
  let reviewCount = 0;
  let deliveredCount = 0;
  let fileCount = 0;
  let workspaceReady = true;
  let assignedProjects: ReviewProject[] = [];
  let unassignedProjectCount = 0;
  let editors: ReviewEditorOption[] = [];
  let managerTasks: ManagerActionProject[] = [];
  let affiliateData: AffiliatePortalData | null = null;
  let affiliateReady = true;
  const loadCustomerOverview = async () => {
    if (isStaff || user.role === "affiliate") return;
    try {
      const ownerFilter = eq(workspaceProjects.ownerId, userId);
      const recentProjectsPromise: Promise<WorkspaceProjectSummary[]> = canViewProjects
        ? atDashboardStage("customer-project-list", () => retryDatabaseRead(() => db.select(workspaceProjectSummaryColumns).from(workspaceProjects).where(ownerFilter).orderBy(desc(workspaceProjects.updatedAt)).limit(5)))
        : Promise.resolve([]);
      const projectSummaryPromise = canViewProjects || canViewReviews
        ? atDashboardStage("customer-project-summary", () => retryDatabaseRead(() => db.select({
            total: canViewProjects ? drizzleCount() : sql<number>`0`.mapWith(Number),
            active: canViewProjects
              ? sql<number>`count(*) filter (where ${workspaceProjects.status} <> 'delivered')`.mapWith(Number)
              : sql<number>`0`.mapWith(Number),
            reviews: canViewReviews
              ? sql<number>`count(*) filter (where ${workspaceProjects.status} in ('review', 'client_review'))`.mapWith(Number)
              : sql<number>`0`.mapWith(Number),
          }).from(workspaceProjects).where(ownerFilter)))
        : Promise.resolve([{ total: 0, active: 0, reviews: 0 }]);
      const fileSummaryPromise = canViewUploads
        ? atDashboardStage("customer-file-count", () => retryDatabaseRead(() => db.select({ count: drizzleCount() }).from(workspaceProjectFiles).where(eq(workspaceProjectFiles.ownerId, userId))))
        : Promise.resolve([{ count: 0 }]);
      const [recentProjects, projectSummary, fileSummary] = await Promise.all([
        recentProjectsPromise,
        projectSummaryPromise,
        fileSummaryPromise,
      ]);
      projects = recentProjects;
      if (canViewProjects) {
        projectCount = projectSummary[0]?.total ?? 0;
        activeCount = projectSummary[0]?.active ?? 0;
      }
      if (canViewReviews) reviewCount = projectSummary[0]?.reviews ?? 0;
      if (canViewUploads) fileCount = fileSummary[0]?.count ?? 0;
    } catch (error) {
      const cause = error instanceof DashboardStageError ? error.cause : error;
      if (!isMissingWorkspaceSchema(cause)) throw error;
      workspaceReady = false;
    }
  };

  const loadBalance = async () => {
    let clientBalance: Awaited<ReturnType<typeof loadClientWorkspace>> | null = null;
    let balanceReady = true;
    if (allowedFeatures.includes("billing") && ["user", "customer"].includes(user.role)) {
      try { clientBalance = await loadClientWorkspace(db, userId); }
      catch (error) {
        if (!isMissingClientWorkspaceSchema(error)) throw error;
        balanceReady = false;
      }
    }
    return { clientBalance, balanceReady };
  };
  const loadStaffOverview = async () => {
    if (!isStaff || !canViewProjects) return;
    const actor: ReviewActor = {
      id: userId,
      key: `user:${userId}`,
      name: user.name || (user.role === "project_manager" ? "Manager" : "Editor"),
      role: user.role,
      admin: false,
    };
    if (user.role === "project_manager") {
      const chat = createChatStore(db, context);
      await importMissingClientProjectManagers(db, actor, await chat.listLegacyClientManagerAssignments(actor));
    }
    const [assigned, summary] = await Promise.all([
      canViewProjects && canViewReviews
        ? loadAssignedProjects(db, actor, "", "all", 1)
        : Promise.resolve({ projects: [], count: 0, page: 1, pageCount: 1 }),
      loadAssignedProjectSummary(db, actor),
    ]);
    assignedProjects = canViewProjects ? assigned.projects.slice(0, 5) : [];
    projectCount = canViewProjects ? summary.total : 0;
    activeCount = canViewProjects ? summary.active : 0;
    deliveredCount = canViewProjects ? summary.delivered : 0;
    reviewCount = canViewReviews ? summary.reviews : 0;
    unassignedProjectCount = user.role === "project_manager" && canViewProjects ? summary.unassigned : 0;
    if (user.role === "project_manager" && canViewProjects && canViewReviews) {
      try {
        [editors, managerTasks] = await Promise.all([
          loadReviewEditorOptions(db, actor),
          loadManagerActionQueue(db, actor),
        ]);
      } catch (error) {
        if (!isMissingReviewSchema(error)) throw error;
      }
    }
  };
  const loadAffiliateOverview = async () => {
    if (user.role !== "affiliate") return;
    try {
      affiliateData = await getAffiliatePortalData(db, userId, new URL(request.url).origin);
    } catch (error) {
      if (!isMissingMarketingSchema(error)) throw error;
      affiliateReady = false;
    }
  };
  const [, { clientBalance, balanceReady }] = await Promise.all([
    atDashboardStage("customer-projects", loadCustomerOverview),
    atDashboardStage("client-balance", loadBalance),
    atDashboardStage("staff-overview", loadStaffOverview),
    atDashboardStage("affiliate-overview", loadAffiliateOverview),
  ]);
  return {
    user: toPublicUser(user), allowedFeatures, projects, projectCount, activeCount, reviewCount,
    deliveredCount, fileCount, workspaceReady, noDashboardAccess: false, clientBalance, balanceReady,
    assignedProjects, unassignedProjectCount, editors, managerTasks, affiliateData, affiliateReady,
  };
}

export async function loader(args: LoaderFunctionArgs) {
  try {
    return await loadDashboard(args);
  } catch (error) {
    if (error instanceof Response && error.status < 500) throw error;
    const stageError = error instanceof DashboardStageError ? error : null;
    const cause = stageError?.cause ?? error;
    const status = cause instanceof Response && cause.status >= 500 ? cause.status : 500;
    const requestReference = getRequestReference(args.request.headers.get("cf-ray"));
    // Worker observability captures this structured record. Keep request data,
    // session values, SQL text, and provider credentials out of production logs.
    const errorCause = cause instanceof Error ? cause.cause ?? cause : cause;
    const code = errorCause && typeof errorCause === "object" && "code" in errorCause ? errorCause.code : undefined;
    const databaseCode = typeof code === "string" && /^(?:[A-Z0-9]{5}|CONNECT_TIMEOUT|CONNECTION_CLOSED|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(code) ? code : undefined;
    console.error("Dashboard load failed.", {
      route: "dashboard",
      requestReference,
      stage: stageError?.stage ?? "dashboard-loader",
      status,
      errorType: cause instanceof Error ? cause.name : cause instanceof Response ? "Response" : "UnknownError",
      ...(databaseCode ? { databaseCode } : {}),
    });
    scheduleApplicationErrorCapture(args.context, args.request, cause);
    throw data({ diagnostics: {
      requestReference,
      route: "dashboard",
      stage: stageError?.stage ?? "dashboard-loader",
      status,
      errorType: cause instanceof Error ? cause.name : cause instanceof Response ? "Response" : "UnknownError",
      ...(databaseCode ? { databaseCode } : {}),
    } }, { status });
  }
}

export default function DashboardRoute() {
  const { user, allowedFeatures, projects, projectCount, activeCount, reviewCount, deliveredCount, fileCount, workspaceReady, noDashboardAccess, clientBalance, balanceReady, assignedProjects, unassignedProjectCount, editors, managerTasks, affiliateData, affiliateReady } = useLoaderData<typeof loader>();
  const displayName = user.name || user.email;
  const canViewProjects = allowedFeatures.includes("projects");
  const canViewReviews = canViewProjects && allowedFeatures.includes("reviews");
  const canStartProject = canViewProjects && ["user", "customer"].includes(user.role);
  const visibleNavItems = navItems.filter((item) => allowedFeatures.includes(item.feature) && (item.feature !== "reviews" || canViewReviews));
  if (user.role === "project_manager" && allowedFeatures.includes("projects")) visibleNavItems.splice(2, 0, { label: "Clients", icon: "group", path: "/dashboard/clients", feature: "projects" });
  const dashboardMetrics = [
    ...(canViewProjects ? [
      { label: "Active projects", value: activeCount, icon: "movie", to: "/dashboard/projects" },
      { label: "Project requests", value: projectCount, icon: "receipt_long", to: "/dashboard/projects" },
    ] : []),
    ...(canViewReviews ? [{ label: "Cuts to review", value: reviewCount, icon: "rate_review", to: "/dashboard/reviews" }] : []),
    ...(allowedFeatures.includes("uploads") ? [{ label: "Shared file links", value: fileCount, icon: "upload_file", to: "/dashboard/uploads" }] : []),
  ];

  return (
    <WorkspaceShell
      title="Dashboard"
      navItems={visibleNavItems.map(({ label, icon, path }) => ({ label, icon, to: path, end: path === "/dashboard" }))}
      account={{ name: displayName, detail: normalizeRole(user.role), imageUrl: user.profileImageUrl }}
      mobileMenu
      navigationFeedback
      hideHeaderTitle
      profileTo={allowedFeatures.includes("settings") ? "/dashboard/profile" : null}
      profileNavAtBottom
      settingsTo={allowedFeatures.includes("settings") ? "/dashboard/settings" : null}
      startProjectTo={canStartProject ? "/dashboard/projects#new-project" : null}
      notificationsTo={canViewReviews ? "/dashboard/reviews" : null}
      notificationCount={canViewReviews ? reviewCount : 0}
      accountAction={(
        <ConfirmSignOutButton buttonClassName="neo-workspace__signout-trigger">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
        </ConfirmSignOutButton>
      )}
    >
      {noDashboardAccess ? (
        <section className="neo-workspace__panel mx-auto max-w-2xl rounded-[20px] p-6 sm:p-8" role="status">
          <h2 className="text-xl font-black text-[#17202a]">No dashboard pages are enabled for this account</h2>
          <p className="mt-2 text-sm text-[#687583]">Contact the EdiCut team if you think you should have access.</p>
        </section>
      ) : (
        <>
          {!workspaceReady ? <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="status">{WORKSPACE_MIGRATION_NOTICE}</p> : null}
          <p className="neo-workspace__eyebrow mb-7">Your creative workspace</p>
          {!balanceReady ? <p role="status" className="neo-workspace__panel mb-7 rounded-2xl p-5 text-sm text-slate-600">Editing balances and creator profile setup are waiting for a database migration. Your existing subscription records have not changed.</p> : null}
          {clientBalance && ["user", "customer"].includes(user.role) ? <ClientBalance purchases={clientBalance.purchases} hasProfile={Boolean(clientBalance.profile)} canStartProjects={canViewProjects} /> : null}
          {user.role === "project_manager" || user.role === "editor" ? (
            <RoleDashboardOverview
              role={user.role}
              projectsEnabled={canViewProjects}
              reviewsEnabled={canViewReviews}
              projects={assignedProjects}
              projectCount={projectCount}
              activeCount={activeCount}
              reviewCount={reviewCount}
              deliveredCount={deliveredCount}
              unassignedCount={unassignedProjectCount}
              editors={editors}
              managerTasks={managerTasks}
            />
          ) : user.role === "affiliate" ? (
            <RoleDashboardOverview affiliate={affiliateData} ready={affiliateReady} />
          ) : (
            <>
          <section aria-labelledby="workspace-overview-title">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#9699ac]">Your workspace</p><h2 id="workspace-overview-title" className="mt-1 text-xl font-black tracking-[-0.035em]">Project overview</h2></div>
              {canViewProjects ? <Link to="/dashboard/projects" className="text-xs font-black text-[#6d55e8] underline">View all projects</Link> : null}
            </div>
            {dashboardMetrics.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {dashboardMetrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
              </div>
            ) : (
              <p className="neo-workspace__panel rounded-2xl p-5 text-sm text-[#687583]">No dashboard details are enabled for this role.</p>
            )}
          </section>

          {canViewProjects ? (
            <section className="neo-workspace__panel mt-6 rounded-[20px] p-4 sm:p-6" aria-labelledby="recent-projects-title">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.17em] text-[#9699ac]">Recent work</p><h2 id="recent-projects-title" className="mt-1 text-lg font-black tracking-[-0.035em]">Your projects</h2></div><Link to="/dashboard/projects" className="rounded-full border border-[#e4e7ea] px-4 py-2 text-xs font-black text-[#536779]">Projects</Link></div>
              {projects.length ? (
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead><tr className="border-b border-[#edf0f2] text-[10px] uppercase tracking-wide text-[#89939b]"><th className="px-3 py-3">Project</th><th className="px-3 py-3">Creator / brand</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Updated</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id} className="border-b border-[#f1f3f5]"><td className="px-3 py-3 font-bold text-[#17202a]">{project.title}</td><td className="px-3 py-3 text-[#687583]">{project.channelName}</td><td className="px-3 py-3"><span className="rounded-full bg-[#f0ecfb] px-3 py-1 text-[10px] font-black text-[#6550c7]">{statusLabels[project.status] ?? project.status}</span></td><td className="px-3 py-3 text-xs text-[#687583]">{new Date(project.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
              ) : (
                <div className="mt-4 rounded-2xl bg-[#f5f6fa] p-5"><h3 className="text-sm font-black text-[#17202a]">No project requests yet</h3><p className="mt-1 text-sm text-[#687583]">Start a project and your brief, files, review notes, and billing estimate will stay together here.</p><Link to="/dashboard/projects#new-project" className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white">Start a project</Link></div>
              )}
            </section>
          ) : null}
            </>
          )}
        </>
      )}
    </WorkspaceShell>
  );
}

function MetricCard({ label, value, icon, to }: { label: string; value: number; icon: string; to: string }) {
  return <Link to={to} className="neo-workspace__panel group flex min-h-[112px] items-center justify-between gap-3 rounded-2xl p-4 transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]"><div><p className="text-xs font-bold text-[#7b8790]">{label}</p><p className="mt-2 text-2xl font-black text-[#17202a]">{value}</p></div><span className="neo-icon-badge flex h-10 w-10 items-center justify-center rounded-xl"><span className="material-symbols-outlined" aria-hidden="true">{icon}</span></span></Link>;
}

function normalizeRole(role: string) {
  const labels: Record<string, string> = { admin: "Administrator", manager: "Editor manager", project_manager: "Editor manager", editor: "Editor", customer_support: "Customer support", affiliate: "Affiliate marketer", client: "Client", customer: "Client", user: "Client" };
  return labels[role] ?? role.replace(/[_-]/g, " ");
}
