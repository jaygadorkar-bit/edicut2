import { useState } from "react";
import { ArrowRight, UserRound } from "lucide-react";
import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { count as drizzleCount, desc, eq } from "drizzle-orm";
import { workspaceProjects } from "@edicut/db/schema";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { IntakeErrors, IntakeField } from "../components/ClientIntakeFields";
import { validateProjectBrief } from "../lib/client-intake";
import { requireClientWorkspace } from "../lib/client-workspace-access.server";
import { clientNavigation } from "../lib/client-workspace-navigation";
import { createPurchasedProject, isMissingClientWorkspaceSchema, loadClientWorkspace, type ClientPurchase } from "../lib/client-workspace.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { consumeUsageLimit } from "../lib/usage-protection.server";
import { isMissingWorkspaceSchema, isWorkspaceRecordId } from "../lib/workspace";
import { workspaceProjectColumns, type WorkspaceProjectView } from "../lib/workspace-projects.server";
import { getPageWithinRange, getPositivePage } from "../lib/admin-data-requirements";

const PROJECTS_PER_PAGE = 25;

export const meta: MetaFunction = () => [{ title: "Projects | EdiCut" }, { name: "robots", content: "noindex,nofollow" }];
export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" }; }
export async function loader(args: LoaderFunctionArgs) {
  const { db, userId, user, features } = await requireClientWorkspace(args);
  const requestedPage = getPositivePage(new URL(args.request.url).searchParams.get("page"));
  try {
    const [state, projectSummary] = await Promise.all([
      loadClientWorkspace(db, userId),
      db.select({ count: drizzleCount() }).from(workspaceProjects).where(eq(workspaceProjects.ownerId, userId)),
    ]);
    const projectCount = projectSummary[0]?.count ?? 0;
    const pageCount = Math.max(1, Math.ceil(projectCount / PROJECTS_PER_PAGE));
    const page = getPageWithinRange(requestedPage, pageCount);
    const projects = await db.select(workspaceProjectColumns).from(workspaceProjects)
      .where(eq(workspaceProjects.ownerId, userId)).orderBy(desc(workspaceProjects.updatedAt))
      .limit(PROJECTS_PER_PAGE).offset((page - 1) * PROJECTS_PER_PAGE);
    return { user, features, ...state, projects, projectCount, page, pageCount, hasNext: page < pageCount, ready: true, token: crypto.randomUUID() };
  } catch (error) {
    if (!isMissingClientWorkspaceSchema(error) && !isMissingWorkspaceSchema(error)) throw error;
    return { user, features, profile: null, purchases: [] as ClientPurchase[], projects: [] as WorkspaceProjectView[], projectCount: 0, page: 1, pageCount: 1, hasNext: false, ready: false, token: crypto.randomUUID() };
  }
}
export async function action(args: ActionFunctionArgs) {
  if (!isSameSiteMutation(args.request)) return forbiddenMutation();
  const { db, userId } = await requireClientWorkspace(args);
  const limit = await consumeUsageLimit({ ...args, bindingName: "USER_ACTION_LIMITER", key: `user:${userId}`, localLimit: 60, localPeriodSeconds: 60 });
  if (limit !== "allowed") return { error: "Please wait a minute before trying again." };
  const form = await readMutationForm(args.request, 64 * 1024);
  if (!form || form.get("intent") !== "create-project") return { error: "Submit a valid project brief under 64 KB." };
  const values = Object.fromEntries([...form].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  const token = String(form.get("requestToken") ?? "");
  const subscriptionId = String(form.get("subscriptionId") ?? "");
  if (!isWorkspaceRecordId(token) || !isWorkspaceRecordId(subscriptionId)) return { error: "Choose a paid package and refresh this form before submitting.", values };
  const result = validateProjectBrief(form);
  if (result.errors) return { errors: result.errors, values };
  try {
    const saved = await createPurchasedProject(db, userId, subscriptionId, token, result.value);
    if (saved.error) return { error: saved.error, values };
    return redirect(`/dashboard/projects?created=${saved.id}#your-projects`);
  } catch (error) {
    if (!isMissingClientWorkspaceSchema(error) && !isMissingWorkspaceSchema(error)) throw error;
    return { error: "Project setup is temporarily unavailable. Your balance was not charged for an incomplete project.", values };
  }
}
export function creditLabel(purchase: ClientPurchase) {
  return purchase.type === "monthly" ? `${purchase.remaining / 60} editing hours available` : `${purchase.remaining} video credit available`;
}
export default function ProjectsRoute() {
  const { user, features, profile, purchases, projects, projectCount, page, pageCount, hasNext, ready, token } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  const available = purchases.filter(p => p.active && p.remaining > 0);
  const hasPaidPackage = purchases.length > 0;
  const [selected, setSelected] = useState(result?.values?.subscriptionId || available[0]?.id || "");
  const purchase = available.find(p => p.id === selected);
  const values: Record<string, string> = { videoType: "Online video", aspectRatio: "16:9", resolution: "1080p", captions: "Burned-in", ...result?.values };
  const field = (name: string, label: string, props: Partial<Parameters<typeof IntakeField>[0]> = {}) => <IntakeField name={name} label={label} values={values} errors={result?.errors} {...props} />;
  return <WorkspaceShell title="Projects" navItems={clientNavigation(features)} account={{ name: user.name || user.email, detail: "Client", imageUrl: user.profileImageUrl }} mobileMenu navigationFeedback profileTo={features.includes("settings") ? "/dashboard/profile" : null} profileNavAtBottom settingsTo={features.includes("settings") ? "/dashboard/settings" : null} startProjectTo={features.includes("projects") ? "/dashboard/projects#new-project" : null} notificationsTo={features.includes("reviews") ? "/dashboard/reviews" : null}>
    <div className="min-w-0 space-y-7">
      {!ready ? (
        <p id="new-project" role="status" className="neo-workspace__panel scroll-mt-28 rounded-2xl p-6">
          Project setup is waiting for its database migration. Please try again later.
        </p>
      ) : !profile ? (
        <section id="new-project" aria-labelledby="new-project-title" className="neo-workspace__panel scroll-mt-28 rounded-3xl p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
            <div className="flex min-w-0 items-start gap-4">
              <span className="neo-icon-badge inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-[#5141a9]">
                <UserRound aria-hidden="true" size={22} strokeWidth={1.8} />
              </span>
              <div className="min-w-0 pt-0.5">
                {hasPaidPackage ? <p className="mb-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">Profile setup required</p> : null}
                <h2 id="new-project-title" className="text-xl font-bold leading-tight sm:text-2xl">
                  {hasPaidPackage ? "Finish your creator profile" : "Choose a package to get started"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {hasPaidPackage
                    ? "Add your creator name, platform, and public profile link once. Then submit a project brief here whenever you have editing balance."
                    : "Choose a package before starting your first project. Once payment is confirmed, set up your creator profile and submit a brief."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end sm:pl-4">
              <Link
                to={hasPaidPackage ? "/dashboard/profile#channel-profile" : "/pricing"}
                className="neo-workspace__setup-cta"
              >
                {hasPaidPackage ? "Set up profile" : "Browse packages"}
                <ArrowRight aria-hidden="true" size={16} strokeWidth={2.25} />
              </Link>
              {!hasPaidPackage ? (
                <Link to="/dashboard/subscriptions" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-bold text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900">
                  Subscription status
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section id="new-project" className="neo-workspace__panel scroll-mt-28 rounded-3xl p-5 sm:p-8" aria-labelledby="new-project-title">
          <p className="neo-workspace__eyebrow">New project</p><h3 id="new-project-title" className="mt-2 text-2xl font-bold">Tell us what you’re making.</h3><p className="mb-7 mt-2 text-sm leading-6 text-slate-600">Creator preferences are saved for <strong>{profile.channelName}</strong>. Only project-specific details are needed below.</p>
          {!available.length ? <p className="rounded-xl bg-slate-100 p-5 text-sm leading-6">No editing balance is available. <Link to="/pricing" className="font-bold underline">Choose another package</Link> or <Link to="/dashboard/subscriptions" className="font-bold underline">check your subscription status</Link>.</p> : <Form method="post">
            <input type="hidden" name="intent" value="create-project" /><input type="hidden" name="requestToken" value={result?.values?.requestToken || token} />
            <IntakeErrors error={result?.error} errors={result?.errors} />
            <fieldset disabled={busy} className="min-w-0"><legend className="mb-5 text-base font-bold">1. Package & video</legend>
              <div className="grid gap-5 sm:grid-cols-2"><div className="min-w-0 sm:col-span-2"><label htmlFor="project-package" className="mb-2 block text-sm font-bold">Use a purchased package</label><select id="project-package" name="subscriptionId" value={selected} onChange={event => setSelected(event.target.value)} required className="neo-workspace__profile-input min-h-12 w-full min-w-0 rounded-xl px-4 text-sm">{available.map(p => <option key={p.id} value={p.id}>{p.name} · {creditLabel(p)}</option>)}</select>{purchase ? <p className="mt-2 text-xs leading-5 text-slate-600">{purchase.expiresAt ? `Monthly capacity ends ${new Date(purchase.expiresAt).toLocaleDateString()}. Hours are reserved when you submit; editing and revisions use this allowance.` : "Submitting this project uses one video credit. Purchased add-ons stay attached to this package."}</p> : null}</div>
                {field("title", "Project name", { maxLength: 120 })}
                {field("videoType", "Video type", { children: ["Online video", "YouTube video", "Podcast", "Tutorial", "Short-form", "Other"].map(v => <option key={v}>{v}</option>) })}
                {field("finishedMinutes", "Finished video length (minutes)", { type: "number", min: 0.01, max: 600, step: 0.01 })}
                {field("rawMinutes", "Total raw footage (minutes)", { type: "number", min: 0.01, max: 10000, step: 0.01 })}
                {purchase?.type === "monthly" ? field("editingHours", "Editing hours to reserve", { type: "number", min: 0.25, max: purchase.remaining / 60, step: 0.25, hint: "Your estimate of editing time, including revisions. We’ll confirm the scope before work begins." }) : null}
                {field("deadline", "Preferred delivery date", { type: "date", min: new Date().toISOString().slice(0, 10), hint: "The team confirms the schedule after reviewing your footage." })}
                {field("objective", "What should this video achieve?", { multiline: true, hint: "Describe the story, key message, audience, and call to action." })}
              </div>
            </fieldset>
            <fieldset disabled={busy} className="mt-8 min-w-0 border-t border-slate-200 pt-7"><legend className="text-base font-bold">2. Footage & references</legend><div className="mt-5 grid gap-5">
              {field("footageUrl", "Source footage folder", { type: "url", hint: "Use a private HTTPS sharing link. Give your editor access to the folder; files remain in your storage." })}
              {field("scriptUrl", "Script / outline / timestamps", { type: "url", required: false })}
              {field("referenceUrl", "Reference for this video", { type: "url", required: false })}
              {field("instructions", "Editing instructions", { multiline: true, maxLength: 8000, hint: "Include clip order, sections to remove, B-roll, music preferences, on-screen text, thumbnail ideas, and anything to avoid. Include access instructions, never passwords." })}
            </div></fieldset>
            <fieldset disabled={busy} className="mt-8 min-w-0 border-t border-slate-200 pt-7"><legend className="text-base font-bold">3. Delivery requirements</legend><div className="mt-5 grid gap-5 sm:grid-cols-3">
              {field("aspectRatio", "Aspect ratio", { children: ["16:9", "9:16", "1:1", "4:5"].map(v => <option key={v}>{v}</option>) })}
              {field("resolution", "Resolution", { children: ["1080p", "4K"].map(v => <option key={v}>{v}</option>) })}
              {field("captions", "Captions", { children: ["None", "Burned-in", "Subtitle file", "Both"].map(v => <option key={v}>{v}</option>) })}
            </div></fieldset>
            <div className="mt-8 border-t border-slate-200 pt-6"><button disabled={busy || !purchase} type="submit" className="neo-workspace__profile-submit min-h-12 w-full rounded-xl px-6 text-sm font-bold disabled:opacity-60 sm:w-auto">{busy ? "Submitting your project…" : "Submit project brief →"}</button><p className="mt-3 text-xs leading-5 text-slate-600">We’ll review your brief and confirm the scope and schedule. No additional payment is collected here.</p></div>
          </Form>}
        </section>
      )}
      {ready ? <section id="your-projects" className="scroll-mt-28" aria-labelledby="your-projects-title"><h3 id="your-projects-title" className="mb-4 text-xl font-bold">Your projects <span className="ml-2 text-sm font-normal text-slate-500">{projectCount}</span></h3>
        {projects.length ? <div className="grid gap-4">{projects.map(p => <article key={p.id} className="neo-workspace__panel min-w-0 rounded-2xl p-5 sm:p-6"><div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><h4 className="break-words font-bold">{p.title}</h4><p className="mt-1 text-xs text-slate-600">{p.channelName} · {p.deadline ? `Target: ${p.deadline}` : "Schedule to be confirmed"}</p></div><span className="h-fit rounded-full bg-slate-200 px-3 py-1 text-xs font-bold">{p.status.replaceAll("_", " ")}</span></div><details className="mt-4"><summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-slate-600">View submitted brief</summary><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{p.notes || "No brief was recorded for this older project."}</p></details><div className="mt-3 flex flex-wrap gap-3">{features.includes("uploads") ? <Link to="/dashboard/uploads" className="inline-flex min-h-11 items-center text-xs font-bold underline">Manage file links</Link> : null}{features.includes("reviews") ? <Link to="/dashboard/reviews" className="inline-flex min-h-11 items-center text-xs font-bold underline">Review cuts</Link> : null}</div></article>)}</div> : <p className="neo-workspace__panel rounded-2xl p-6 text-sm text-slate-600">{profile ? "Your first project will appear here after you submit the brief above." : "Your project history will appear here after your first submission. Complete your creator profile above to start."}</p>}
        {pageCount > 1 ? <nav aria-label="Project pages" className="mt-5 flex items-center justify-between gap-3 text-sm font-bold">
          {page > 1 ? <Link className="min-h-11 p-3 underline" to={`?page=${page - 1}#your-projects`}>Previous</Link> : <span />}
          <span>Page {page} of {pageCount}</span>
          {hasNext ? <Link className="min-h-11 p-3 underline" to={`?page=${page + 1}#your-projects`}>Next</Link> : <span />}
        </nav> : null}
      </section> : null}
    </div>
  </WorkspaceShell>;
}
