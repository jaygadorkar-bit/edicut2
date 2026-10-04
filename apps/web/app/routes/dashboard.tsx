import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { count as drizzleCount, desc, eq, sql } from "drizzle-orm";
import { workspaceProjectFiles, workspaceProjects } from "@edicut/db/schema";
import { findUserById } from "@edicut/db/repositories/users";
import { requireUserId, getSession, destroySession } from "../lib/session.server";
import { getDbFromContext } from "../lib/db.server";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import { canAccessDashboardFeature, getAllowedDashboardFeatures, getDashboardLandingPath, type DashboardFeature } from "../lib/role-feature-access";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { isMissingWorkspaceSchema, WORKSPACE_MIGRATION_NOTICE } from "../lib/workspace";
import { workspaceProjectColumns, type WorkspaceProjectView } from "../lib/workspace-projects.server";

const navItems = [
  { label: "Dashboard", icon: "dashboard_customize", path: "/dashboard", feature: "overview" as DashboardFeature },
  { label: "Projects", icon: "video_library", path: "/dashboard/projects", feature: "projects" as DashboardFeature },
  { label: "Reviews", icon: "rate_review", path: "/dashboard/reviews", feature: "reviews" as DashboardFeature },
  { label: "Uploads", icon: "upload_file", path: "/dashboard/uploads", feature: "uploads" as DashboardFeature },
  { label: "Purchases", icon: "receipt_long", path: "/dashboard/subscriptions", feature: "billing" as DashboardFeature },
  { label: "Affiliates", icon: "hub", path: "/dashboard/affiliates", feature: "affiliates" as DashboardFeature },
  { label: "Settings", icon: "settings", path: "/dashboard/settings", feature: "settings" as DashboardFeature },
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

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  if (formData.get("intent") !== "logout") return null;
  const session = await getSession(request.headers.get("Cookie"), context);
  return redirect("/signin?redirectTo=/dashboard", {
    headers: { "Set-Cookie": await destroySession(session, context) },
  });
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  if (!user) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin?redirectTo=/dashboard", { headers: { "Set-Cookie": await destroySession(session, context) } });
  }

  const roleFeatureAccess = await getRoleFeatureAccessSettings(db, context);
  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);
  const firstName = (user.name || user.email).split(/[\s@]/)[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (allowedFeatures.length === 0) {
    return {
      user,
      allowedFeatures,
      projects: [] as WorkspaceProjectView[],
      projectCount: 0,
      activeCount: 0,
      reviewCount: 0,
      fileCount: 0,
      firstName,
      greeting,
      workspaceReady: true,
      noDashboardAccess: true,
    };
  }

  if (!canAccessDashboardFeature(user.role, "overview", roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(allowedFeatures));
  }

  const canViewProjects = allowedFeatures.includes("projects");
  const canViewReviews = allowedFeatures.includes("reviews");
  const canViewUploads = allowedFeatures.includes("uploads");
  let projects: WorkspaceProjectView[] = [];
  let projectCount = 0;
  let activeCount = 0;
  let reviewCount = 0;
  let fileCount = 0;
  let workspaceReady = true;
  try {
    const ownerFilter = eq(workspaceProjects.ownerId, userId);
    const recentProjectsPromise: Promise<WorkspaceProjectView[]> = canViewProjects
      ? db.select(workspaceProjectColumns).from(workspaceProjects).where(ownerFilter).orderBy(desc(workspaceProjects.updatedAt)).limit(5)
      : Promise.resolve([]);
    const projectSummaryPromise = canViewProjects || canViewReviews
      ? db.select({
          total: canViewProjects ? drizzleCount() : sql<number>`0`.mapWith(Number),
          active: canViewProjects
            ? sql<number>`count(*) filter (where ${workspaceProjects.status} <> 'delivered')`.mapWith(Number)
            : sql<number>`0`.mapWith(Number),
          reviews: canViewReviews
            ? sql<number>`count(*) filter (where ${workspaceProjects.status} in ('review', 'client_review'))`.mapWith(Number)
            : sql<number>`0`.mapWith(Number),
        }).from(workspaceProjects).where(ownerFilter)
      : Promise.resolve([{ total: 0, active: 0, reviews: 0 }]);
    const fileSummaryPromise = canViewUploads
      ? db.select({ count: drizzleCount() }).from(workspaceProjectFiles).where(eq(workspaceProjectFiles.ownerId, userId))
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
    if (!isMissingWorkspaceSchema(error)) throw error;
    workspaceReady = false;
  }

  return { user, allowedFeatures, projects, projectCount, activeCount, reviewCount, fileCount, firstName, greeting, workspaceReady, noDashboardAccess: false };
}

export default function DashboardRoute() {
  const { user, allowedFeatures, projects, projectCount, activeCount, reviewCount, fileCount, workspaceReady, noDashboardAccess } = useLoaderData<typeof loader>();
  const displayName = user.name || user.email;
  const visibleNavItems = navItems.filter((item) => allowedFeatures.includes(item.feature));
  const canViewProjects = allowedFeatures.includes("projects");
  const dashboardMetrics = [
    ...(canViewProjects ? [
      { label: "Active projects", value: activeCount, icon: "movie", to: "/dashboard/projects" },
      { label: "Project requests", value: projectCount, icon: "receipt_long", to: "/dashboard/projects" },
    ] : []),
    ...(allowedFeatures.includes("reviews") ? [{ label: "Cuts to review", value: reviewCount, icon: "rate_review", to: "/dashboard/reviews" }] : []),
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
      settingsTo={allowedFeatures.includes("settings") ? "/dashboard/settings" : null}
      notificationsTo={allowedFeatures.includes("reviews") ? "/dashboard/reviews" : null}
      notificationCount={allowedFeatures.includes("reviews") ? reviewCount : 0}
      accountAction={(
        <Form method="post">
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" className="text-[#687583] transition hover:text-[#17202a]" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
          </button>
        </Form>
      )}
      headerActions={canViewProjects ? (
        <Link to="/dashboard/projects#new-project" className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex">
          <span className="material-symbols-outlined text-[17px]" aria-hidden="true">add</span>
          New project
        </Link>
      ) : null}
    >
      {noDashboardAccess ? (
        <section className="neo-workspace__panel mx-auto max-w-2xl rounded-[20px] p-6 sm:p-8" role="status">
          <h2 className="text-xl font-black text-[#17202a]">No dashboard pages are enabled for this account</h2>
          <p className="mt-2 text-sm text-[#687583]">Contact the EdiCut team if you think you should have access.</p>
        </section>
      ) : (
        <>
          {!workspaceReady ? <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="status">{WORKSPACE_MIGRATION_NOTICE}</p> : null}
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
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[540px] text-left text-sm"><thead><tr className="border-b border-[#edf0f2] text-[10px] uppercase tracking-wide text-[#89939b]"><th className="px-3 py-3">Project</th><th className="px-3 py-3">Channel</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Updated</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id} className="border-b border-[#f1f3f5]"><td className="px-3 py-3 font-bold text-[#17202a]">{project.title}</td><td className="px-3 py-3 text-[#687583]">{project.channelName}</td><td className="px-3 py-3"><span className="rounded-full bg-[#f0ecfb] px-3 py-1 text-[10px] font-black text-[#6550c7]">{statusLabels[project.status] ?? project.status}</span></td><td className="px-3 py-3 text-xs text-[#687583]">{new Date(project.updatedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>
              ) : (
                <div className="mt-4 rounded-2xl bg-[#f5f6fa] p-5"><h3 className="text-sm font-black text-[#17202a]">No project requests yet</h3><p className="mt-1 text-sm text-[#687583]">Start a project and your brief, files, review notes, and billing estimate will stay together here.</p><Link to="/dashboard/projects#new-project" className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white">Start a project</Link></div>
              )}
            </section>
          ) : null}
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
