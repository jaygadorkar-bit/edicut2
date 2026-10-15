import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, UserRound } from "lucide-react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction, ShouldRevalidateFunction } from "react-router";
import { Link, redirect, useActionData, useLoaderData, useLocation, useRevalidator } from "react-router";
import { count as drizzleCount, desc, eq, and, ilike, inArray, ne } from "drizzle-orm";
import { workspaceProjects } from "@edicut/db/schema";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { ProjectLibrary } from "../components/ProjectLibrary";
import { loadAssignedProjects, loadReviewEditorOptions, loadReviewTeamSummaries, isMissingReviewSchema } from "../lib/project-review.server";
import { sendReviewForm } from "../lib/review-upload-client";
import type { ReviewEditorOption } from "../lib/project-review";
import { ProjectBriefForm } from "../components/ProjectBriefForm";
import { isDatabaseConnectionError, retryDatabaseRead } from "../lib/database-errors";
import { earliestProjectDeliveryDate, validateProjectBrief } from "../lib/client-intake";
import { requireClientWorkspace } from "../lib/client-workspace-access.server";
import { clientNavigation } from "../lib/client-workspace-navigation";
import { createPurchasedProject, isMissingClientWorkspaceSchema, loadClientWorkspace, type ClientPurchase } from "../lib/client-workspace.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { consumeUsageLimit } from "../lib/usage-protection.server";
import { isMissingWorkspaceSchema, isWorkspaceRecordId } from "../lib/workspace";
import { workspaceProjectColumns, type WorkspaceProjectView } from "../lib/workspace-projects.server";
import { getPageWithinRange, getPositivePage } from "../lib/admin-data-requirements";

const PROJECTS_PER_PAGE = 25;
export { creditLabel } from "../components/ProjectBriefForm";

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.ready && !data.profile && data.purchases.length > 0 ? "Creator profile required | EdiCut" : "Projects | EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];
export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" }; }
async function loadProjects(args: LoaderFunctionArgs) {
  const { db, userId, user, features } = await requireClientWorkspace(args);
  const url = new URL(args.request.url);
  const requestedPage = getPositivePage(url.searchParams.get("page"));
  const staff = ["editor", "project_manager"].includes(user.role);
  if (staff) {
    const assigned = await loadAssignedProjects(db, { id: userId, key: `user:${userId}`, name: user.name || "Editor", role: user.role, admin: false }, (url.searchParams.get("q") || "").trim().slice(0,120), url.searchParams.get("view") || "all", requestedPage);
    let editors:ReviewEditorOption[]=[],teams:Awaited<ReturnType<typeof loadReviewTeamSummaries>>={},assignmentReady=true;
    if(user.role==="project_manager")try{[editors,teams]=await Promise.all([loadReviewEditorOptions(db),loadReviewTeamSummaries(db,{id:userId,key:`user:${userId}`,name:user.name||"Manager",role:user.role,admin:false},assigned.projects.map(project=>project.id))]);}catch(error){if(!isMissingReviewSchema(error))throw error;assignmentReady=false;}
    return { user, features, profile: null, purchases: [] as ClientPurchase[], projects: assigned.projects, projectCount: assigned.count, page: assigned.page, pageCount: assigned.pageCount, hasNext: assigned.page < assigned.pageCount, ready: true, token: crypto.randomUUID(), minimumDeliveryDate: earliestProjectDeliveryDate(), staff: true, editors, teams, assignmentReady };
  }
  const query = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const view = url.searchParams.get("view") || "all";
  const filter = and(eq(workspaceProjects.ownerId, userId), query ? ilike(workspaceProjects.title, `%${query.replace(/[\\%_]/g, "\\$&")}%`) : undefined,
    view === "reviews" ? inArray(workspaceProjects.status, ["review", "client_review"]) : view === "delivered" ? eq(workspaceProjects.status, "delivered") : view === "active" ? ne(workspaceProjects.status, "delivered") : undefined);
  try {
    const [state, projectSummary] = await Promise.all([
      loadClientWorkspace(db, userId),
      db.select({ count: drizzleCount() }).from(workspaceProjects).where(filter),
    ]);
    const projectCount = projectSummary[0]?.count ?? 0;
    const pageCount = Math.max(1, Math.ceil(projectCount / PROJECTS_PER_PAGE));
    const page = getPageWithinRange(requestedPage, pageCount);
    const projects = await db.select(workspaceProjectColumns).from(workspaceProjects)
      .where(filter).orderBy(desc(workspaceProjects.updatedAt))
      .limit(PROJECTS_PER_PAGE).offset((page - 1) * PROJECTS_PER_PAGE);
    return { user, features, ...state, projects, projectCount, page, pageCount, hasNext: page < pageCount, ready: true, token: crypto.randomUUID(), minimumDeliveryDate: earliestProjectDeliveryDate(), staff: false };
  } catch (error) {
    if (!isMissingClientWorkspaceSchema(error) && !isMissingWorkspaceSchema(error)) throw error;
    return { user, features, profile: null, purchases: [] as ClientPurchase[], projects: [] as WorkspaceProjectView[], projectCount: 0, page: 1, pageCount: 1, hasNext: false, ready: false, token: crypto.randomUUID(), minimumDeliveryDate: earliestProjectDeliveryDate(), staff: false };
  }
}
export async function loader(args: LoaderFunctionArgs) {
  try { return await retryDatabaseRead(() => loadProjects(args)); }
  catch (error) {
    if (!isDatabaseConnectionError(error)) throw error;
    throw new Response("Account data is temporarily unavailable.", { status: 503, statusText: "Service Unavailable" });
  }
}
export const shouldRevalidate: ShouldRevalidateFunction = ({ actionResult, defaultShouldRevalidate }) => {
  // Keep the current form and its answers when a submission needs correction or retry.
  if (actionResult && (actionResult.error || actionResult.errors)) return false;
  return defaultShouldRevalidate;
};
export async function action(args: ActionFunctionArgs) {
  if (!isSameSiteMutation(args.request)) return forbiddenMutation();
  const form = await readMutationForm(args.request, 64 * 1024);
  if (!form || form.get("intent") !== "create-project") return { error: "Submit a valid project brief under 64 KB." };
  const values = Object.fromEntries([...form].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  try {
    const { db, userId } = await retryDatabaseRead(() => requireClientWorkspace(args));
    const limit = await consumeUsageLimit({ ...args, bindingName: "USER_ACTION_LIMITER", key: `user:${userId}`, localLimit: 60, localPeriodSeconds: 60 });
    if (limit !== "allowed") return { error: "Please wait a minute before trying again.", values };
    const token = String(form.get("requestToken") ?? "");
    const subscriptionId = String(form.get("subscriptionId") ?? "");
    if (!isWorkspaceRecordId(token) || !isWorkspaceRecordId(subscriptionId)) return { error: "Choose a paid package and refresh this form before submitting.", values };
    const result = validateProjectBrief(form);
    if (result.errors) return { errors: result.errors, values };
    const saved = await createPurchasedProject(db, userId, subscriptionId, token, result.value);
    if (saved.error) return { error: saved.error, values };
    return redirect(`/dashboard/projects?created=${saved.id}#your-projects`);
  } catch (error) {
    if (isDatabaseConnectionError(error)) return { error: "We couldn’t confirm your submission because the connection dropped. Your answers are still here. Try sending again; the same brief won’t use your balance twice.", values };
    if (!isMissingClientWorkspaceSchema(error) && !isMissingWorkspaceSchema(error)) throw error;
    return { error: "Project setup is temporarily unavailable. Your balance was not charged for an incomplete project.", values };
  }
}
export default function ProjectsRoute() {
  const loaded = useLoaderData<typeof loader>();
  const { user, features, profile, purchases, projects, projectCount, page, pageCount, ready, token, minimumDeliveryDate, staff } = loaded;
  const revalidator=useRevalidator();
  const result = useActionData<typeof action>();
  const location = useLocation();
  // URL fragments are absent from HTTP requests; read them only after hydration.
  const [briefOpen, setBriefOpen] = useState(Boolean(result));
  const previousOpen = useRef(briefOpen);
  useEffect(() => { setBriefOpen(location.hash === "#new-project"); }, [location.hash]);
  useEffect(() => { if (result) setBriefOpen(true); }, [result]);
  useEffect(() => {
    if (previousOpen.current !== briefOpen) {
      document.getElementById(briefOpen ? "new-project-title" : "your-projects-title")?.focus();
      previousOpen.current = briefOpen;
    }
  }, [briefOpen]);
  const available = purchases.filter(p => p.active && p.remaining > 0);
  const hasPaidPackage = purchases.length > 0;
  const profileSetupRequired = ready && !profile && hasPaidPackage;
  return <WorkspaceShell title={profileSetupRequired ? "Creator profile" : briefOpen ? "Start project" : "Projects"} subtitle={profileSetupRequired ? "Required account setup" : undefined} navItems={clientNavigation(features)} account={{ name: user.name || user.email, detail: user.role==="project_manager"?"Project manager":staff?"Editor":"Client", imageUrl: user.profileImageUrl }} mobileMenu navigationFeedback profileTo={features.includes("settings") ? "/dashboard/profile" : null} profileNavAtBottom settingsTo={features.includes("settings") ? "/dashboard/settings" : null} startProjectTo={ready && profile && !briefOpen && features.includes("projects") ? "/dashboard/projects#new-project" : null} notificationsTo={features.includes("reviews") ? "/dashboard/reviews" : null}>
    <div className="min-w-0 space-y-7">
      <noscript><style>{"#new-project[hidden] { display: block; }"}</style></noscript>
      {!ready ? (
        <p id="new-project" role="status" className="neo-workspace__panel scroll-mt-28 rounded-2xl p-6">
          Project setup is waiting for its database migration. Please try again later.
        </p>
      ) : !profile && !staff ? (
        hasPaidPackage ? <section id="new-project" aria-labelledby="new-project-title" className="neo-workspace__panel mx-auto max-w-3xl scroll-mt-28 overflow-hidden rounded-3xl">
          <div className="border-b border-[var(--workspace-line)] p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <span className="neo-icon-badge inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-[#5141a9]">
                <UserRound aria-hidden="true" size={24} strokeWidth={1.8} />
              </span>
              <span className="rounded-full border border-[#7157ed]/20 bg-[#7157ed]/10 px-3 py-1.5 text-sm font-bold text-[#5141a9]">Profile required</span>
            </div>
            <h2 id="new-project-title" className="max-w-lg text-2xl font-bold leading-tight tracking-tight text-[var(--workspace-ink)] sm:text-3xl">Complete your creator profile</h2>
            <p className="mt-3 max-w-xl text-base leading-7 text-slate-600">Your creator details are required before you can continue. Tell us who you are and where you publish your content.</p>
          </div>
          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-bold">What you need to provide</h3><p className="text-sm text-slate-600">All three details are required</p>
            </div>
            <dl className="mt-3 divide-y divide-[var(--workspace-line)]">
              {[
                { name: "Creator or brand name", description: "The name you publish under." },
                { name: "Main platform", description: "Where you share your content, such as YouTube or Instagram." },
                { name: "Public profile link", description: "The HTTPS link to your channel, creator profile, or website." },
              ].map(detail => <div key={detail.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 py-4">
                <dt className="text-sm font-bold text-[var(--workspace-ink)] sm:text-base">{detail.name}</dt>
                <dd className="row-span-2 self-center rounded-full bg-white/60 px-2.5 py-1 text-xs font-semibold text-slate-600">Required</dd>
                <dd className="text-sm leading-6 text-slate-600">{detail.description}</dd>
              </div>)}
            </dl>
            <div className="mt-6 border-t border-[var(--workspace-line)] pt-6">
              <Link to="/dashboard/profile#channel-profile" className="neo-workspace__setup-cta w-full sm:w-auto">Complete creator profile<ArrowRight aria-hidden="true" size={18} strokeWidth={2.25} /></Link>
              <p className="mt-3 text-sm leading-6 text-slate-600">You only need to do this once. You can update your details later in your profile.</p>
            </div>
          </div>
        </section> : <section id="new-project" aria-labelledby="new-project-title" className="neo-workspace__panel scroll-mt-28 rounded-3xl p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <div className="flex min-w-0 items-start gap-4">
              <span className="neo-icon-badge inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-[#5141a9]"><UserRound aria-hidden="true" size={22} strokeWidth={1.8} /></span>
              <div className="min-w-0 pt-0.5">
                <h2 id="new-project-title" className="text-xl font-bold leading-tight sm:text-2xl">Choose a package to get started</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Choose a package before starting your first project. Once payment is confirmed, set up your creator profile and submit a brief.</p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end sm:pl-4">
              <Link to="/pricing" className="neo-workspace__setup-cta">Browse packages<ArrowRight aria-hidden="true" size={16} strokeWidth={2.25} /></Link>
              <Link to="/dashboard/subscriptions" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900">Subscription status</Link>
            </div>
          </div>
        </section>
      ) : profile ? (
        <section id="new-project" hidden={!briefOpen} className="neo-workspace__panel mx-auto max-w-3xl scroll-mt-28 rounded-3xl p-5 sm:p-8" aria-labelledby="new-project-title">
          <Link to="#your-projects" className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-bold text-[#5141a9] outline-none focus-visible:ring-2 focus-visible:ring-[#7157ed]"><ArrowLeft size={17} aria-hidden="true" />Back to projects<span className="sr-only">; keep this draft</span></Link>
          <h2 id="new-project-title" tabIndex={-1} className="text-2xl font-bold tracking-tight outline-none sm:text-3xl">Let’s make your next video.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Three short steps to give your editor everything they need. Your creator details for <strong>{profile.channelName}</strong> are already saved.</p>
          {!available.length ? <p className="mt-6 rounded-xl bg-white/50 p-5 text-sm leading-6">No editing balance is available. <Link to="/pricing" className="font-bold underline">Choose another package</Link> or <Link to="/dashboard/subscriptions" className="font-bold underline">check your subscription status</Link>.</p> : <ProjectBriefForm key={token} purchases={available} token={token} result={result} minimumDeliveryDate={minimumDeliveryDate} />}
        </section>
      ) : null}
      {ready && (profile || staff) ? <section id="your-projects" hidden={briefOpen} className="scroll-mt-28" aria-labelledby="your-projects-title"><ProjectLibrary projects={projects} total={projectCount} page={page} pageCount={pageCount} staff={staff} manager={user.role==="project_manager"} editors={"editors" in loaded?loaded.editors:[]} teams={"teams" in loaded?loaded.teams:{}} assignmentReady={"assignmentReady" in loaded&&loaded.assignmentReady} onAssign={async(id,form)=>{const response=await sendReviewForm(`/api/project-reviews/${id}`,form);if(!response.error)await revalidator.revalidate();return response;}}/></section> : null}
    </div>
  </WorkspaceShell>;
}
