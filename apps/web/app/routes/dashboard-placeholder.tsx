import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useMemo, useState } from "react";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  contactMessages,
  workspaceProjectFiles,
  workspaceProjectReviews,
  workspaceProjects,
} from "@edicut/db/schema";
import { findUserById } from "@edicut/db/repositories/users";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { destroySession, getSession, requireUserId } from "../lib/session.server";
import { getDbFromContext, hasReturnedRows } from "../lib/db.server";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import { getWorkspaceDataRequirements } from "../lib/workspace-data-requirements";
import {
  canAccessDashboardFeature,
  getAllowedDashboardFeatures,
  getDashboardLandingPath,
  type DashboardFeature,
} from "../lib/role-feature-access";
import { SUBSCRIPTION_PACKAGES, formatRequestedCoverageNotes, getCheckoutTotal } from "../lib/subscriptions";
import { isMissingWorkspaceSchema, isValidWorkspaceDate, isWorkspaceRecordId, parseWorkspaceShareUrl, WORKSPACE_MIGRATION_NOTICE } from "../lib/workspace";

const sectionConfigs = {
  projects: {
    label: "Projects",
    icon: "video_library",
    feature: "projects" as DashboardFeature,
    title: "Projects workspace",
    description: "Start an edit, share the brief, and follow each project through delivery.",
  },
  reviews: {
    label: "Reviews",
    icon: "rate_review",
    feature: "reviews" as DashboardFeature,
    title: "Review center",
    description: "Approve a submitted cut or send one clear revision request to your editor.",
  },
  uploads: {
    label: "Uploads",
    icon: "upload_file",
    feature: "uploads" as DashboardFeature,
    title: "File sharing",
    description: "Attach private Drive, Dropbox, OneDrive, or Frame.io links to the right project.",
  },
  billing: {
    label: "Billing",
    icon: "receipt_long",
    feature: "billing" as DashboardFeature,
    title: "Billing center",
    description: "Review package estimates and project billing status in one place.",
  },
  affiliates: {
    label: "Affiliates",
    icon: "hub",
    feature: "affiliates" as DashboardFeature,
    title: "Affiliate hub",
    description: "Referral tracking is managed by the EdiCut team. Contact support to activate your referral account.",
  },
  settings: {
    label: "Settings",
    icon: "settings",
    feature: "settings" as DashboardFeature,
    title: "Workspace settings",
    description: "Manage your sign-in profile and account details.",
  },
} as const;

type PlaceholderSection = keyof typeof sectionConfigs;

const userNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", path: "/dashboard", feature: "overview" as DashboardFeature },
  { label: "Projects", icon: "video_library", path: "/dashboard/projects", feature: "projects" as DashboardFeature },
  { label: "Reviews", icon: "rate_review", path: "/dashboard/reviews", feature: "reviews" as DashboardFeature },
  { label: "Uploads", icon: "upload_file", path: "/dashboard/uploads", feature: "uploads" as DashboardFeature },
  { label: "Billing", icon: "receipt_long", path: "/dashboard/billing", feature: "billing" as DashboardFeature },
  { label: "Affiliates", icon: "hub", path: "/dashboard/affiliates", feature: "affiliates" as DashboardFeature },
  { label: "Settings", icon: "settings", path: "/dashboard/settings", feature: "settings" as DashboardFeature },
];

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.config.label ?? "Workspace"} | EdiCut` },
  { name: "robots", content: "noindex,nofollow" },
];

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function packagePriceCents(slug: string, coverage: { runtime?: boolean; raw?: boolean }) {
  const item = SUBSCRIPTION_PACKAGES.find((entry) => entry.slug === slug);
  return item ? getCheckoutTotal(item, coverage) * 100 : null;
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const section = params.section as PlaceholderSection | undefined;
  const config = section ? sectionConfigs[section] : undefined;
  if (!section || !config) throw redirect("/dashboard");

  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);

  if (!user) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin?redirectTo=/dashboard", {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }

  const roleFeatureAccess = await getRoleFeatureAccessSettings(db);
  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);
  if (!canAccessDashboardFeature(user.role, config.feature, roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(allowedFeatures));
  }

  const requirements = getWorkspaceDataRequirements(section);
  let projects: (typeof workspaceProjects.$inferSelect)[] = [];
  let projectOptions: Array<Pick<typeof workspaceProjects.$inferSelect, "id" | "title">> = [];
  let files: (typeof workspaceProjectFiles.$inferSelect)[] = [];
  let reviews: (typeof workspaceProjectReviews.$inferSelect)[] = [];
  let workspaceReady = true;
  try {
    const ownerFilter = eq(workspaceProjects.ownerId, userId);
    const [projectRows, projectNameRows, fileRows, reviewRows] = await Promise.all([
      requirements.projects
        ? db.select().from(workspaceProjects).where(ownerFilter).orderBy(desc(workspaceProjects.updatedAt))
        : Promise.resolve([]),
      !requirements.projects && requirements.projectNames
        ? db.select({ id: workspaceProjects.id, title: workspaceProjects.title }).from(workspaceProjects).where(ownerFilter)
        : Promise.resolve([]),
      requirements.files
        ? db.select().from(workspaceProjectFiles).where(eq(workspaceProjectFiles.ownerId, userId)).orderBy(desc(workspaceProjectFiles.createdAt))
        : Promise.resolve([]),
      requirements.reviews
        ? db.select().from(workspaceProjectReviews).where(eq(workspaceProjectReviews.ownerId, userId)).orderBy(desc(workspaceProjectReviews.createdAt))
        : Promise.resolve([]),
    ]);
    projects = projectRows;
    projectOptions = requirements.projects
      ? projectRows.map(({ id, title }) => ({ id, title }))
      : projectNameRows;
    files = fileRows;
    reviews = reviewRows;
  } catch (error) {
    if (!isMissingWorkspaceSchema(error)) throw error;
    workspaceReady = false;
  }

  const requestedProjectId = new URL(request.url).searchParams.get("requested");
  const checkoutRequestSaved = section === "billing"
    && requestedProjectId !== null
    && projects.some((project) => project.id === requestedProjectId);

  return { user, allowedFeatures, section, config, projects, projectOptions, files, reviews, workspaceReady, checkoutRequestSaved };
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const section = params.section as PlaceholderSection | undefined;
  const formData = await request.formData();
  const intent = readText(formData, "intent");

  if (intent === "logout") {
    const session = await getSession(request.headers.get("Cookie"), context);
    return redirect("/signin?redirectTo=/dashboard", {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }

  const config = section ? sectionConfigs[section] : undefined;
  if (!section || !config) throw redirect("/dashboard");

  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  if (!user) throw redirect("/signin?redirectTo=/dashboard");
  const roleFeatureAccess = await getRoleFeatureAccessSettings(db);
  if (!canAccessDashboardFeature(user.role, config.feature, roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(getAllowedDashboardFeatures(user.role, roleFeatureAccess)));
  }

  try {
  if (section === "projects" && intent === "create-project") {
    const title = readText(formData, "title");
    const channelName = readText(formData, "channelName");
    const packageSlug = readText(formData, "packageSlug");
    const category = readText(formData, "category");
    const cadence = readText(formData, "cadence");
    const deadline = readText(formData, "deadline");
    const notes = readText(formData, "notes");
    const coverage = { runtime: formData.get("runtime") === "1", raw: formData.get("raw") === "1" };
    const selectedPackage = SUBSCRIPTION_PACKAGES.find((item) => item.slug === packageSlug);
    const estimatedAmountCents = packagePriceCents(packageSlug, coverage);

    if (title.length < 3 || title.length > 120) return { error: "Project name must be between 3 and 120 characters." };
    if (!channelName || channelName.length > 120) return { error: "Add a channel name (up to 120 characters)." };
    if (estimatedAmountCents === null) return { error: "Choose one of the listed editing packages." };
    if (category.length > 80 || cadence.length > 120 || notes.length > 4000) {
      return { error: "One of the project details is too long. Shorten it and try again." };
    }
    if (!isValidWorkspaceDate(deadline)) return { error: "Enter a valid target date." };

    await db.insert(workspaceProjects).values({
      ownerId: userId,
      title,
      channelName,
      packageSlug,
      category: category || null,
      cadence: cadence || null,
      deadline: deadline || null,
      notes: selectedPackage ? formatRequestedCoverageNotes(selectedPackage, notes, coverage) : notes || null,
      estimatedAmountCents,
      billingStatus: "quote_requested",
    });
    return { success: "Project request saved. The EdiCut team will confirm scope and billing before work begins." };
  }

  if (section === "uploads" && intent === "add-file-link") {
    const projectId = readText(formData, "projectId");
    const fileName = readText(formData, "fileName");
    const shareUrl = parseWorkspaceShareUrl(readText(formData, "shareUrl"));
    if (!isWorkspaceRecordId(projectId) || !fileName || fileName.length > 160 || !shareUrl) {
      return { error: "Choose a project, add a file label, and enter a valid HTTPS sharing link." };
    }

    const [project] = await db.select({ id: workspaceProjects.id })
      .from(workspaceProjects)
      .where(and(eq(workspaceProjects.id, projectId), eq(workspaceProjects.ownerId, userId)))
      .limit(1);
    if (!project) return { error: "That project could not be found in your workspace." };

    await db.insert(workspaceProjectFiles).values({ ownerId: userId, projectId, kind: "source", fileName, shareUrl });
    return { success: "File link added to the project." };
  }

  if (section === "uploads" && intent === "remove-file-link") {
    const fileId = readText(formData, "fileId");
    if (!isWorkspaceRecordId(fileId)) return { error: "Choose a valid source link to remove." };

    const result = await db.delete(workspaceProjectFiles)
      .where(and(
        eq(workspaceProjectFiles.id, fileId),
        eq(workspaceProjectFiles.ownerId, userId),
        eq(workspaceProjectFiles.kind, "source"),
      ))
      .returning();
    if (!hasReturnedRows(result)) return { error: "That source link could not be found in your workspace." };
    return { success: "Source link removed from your workspace. The original file in your storage was not changed." };
  }

  if (section === "reviews" && intent === "submit-review") {
    const projectId = readText(formData, "projectId");
    const decision = readText(formData, "decision");
    const feedback = readText(formData, "feedback");
    if (!isWorkspaceRecordId(projectId) || !["approved", "revision_requested"].includes(decision)) {
      return { error: "Choose a project and a review decision." };
    }
    if (feedback.length > 4000 || (decision === "revision_requested" && feedback.length < 3)) {
      return { error: "Add at least 3 characters of feedback when requesting a revision (maximum 4,000)." };
    }

    const result = await db.execute(sql`
      WITH updated AS (
        UPDATE workspace_projects
        SET status = ${decision === "approved" ? "delivered" : "revision"}, updated_at = now()
        WHERE id = ${projectId}
          AND owner_id = ${userId}
          AND status IN ('review', 'client_review')
        RETURNING id
      )
      INSERT INTO workspace_project_reviews (owner_id, project_id, decision, feedback)
      SELECT ${userId}, id, ${decision}, ${feedback || null}
      FROM updated
      RETURNING id
    `);
    const recorded = hasReturnedRows(result);
    if (!recorded) return { error: "That cut is no longer waiting for your review." };
    return { success: decision === "approved" ? "Cut approved. It has been marked delivered." : "Revision request sent to your project history." };
  }

  if (section === "affiliates" && intent === "request-affiliate-access") {
    const channelUrlValue = readText(formData, "channelUrl");
    const channelUrl = channelUrlValue ? parseWorkspaceShareUrl(channelUrlValue) : null;
    const notes = readText(formData, "notes");
    if (channelUrlValue && !channelUrl) return { error: "Enter a valid HTTPS channel or website link." };
    if (notes.length > 4000) return { error: "Keep your note under 4,000 characters." };
    if (!channelUrl && notes.length < 10) return { error: "Add a channel or website link, or tell us a little about your audience." };

    const message = [
      "Affiliate access request",
      channelUrl ? `Channel or website: ${channelUrl}` : null,
      notes ? `About my audience:\n${notes}` : null,
    ].filter((item): item is string => item !== null).join("\n\n");
    await db.insert(contactMessages).values({
      name: user.name || user.email,
      email: user.email.toLowerCase(),
      projectType: "Affiliate access request",
      message,
    });
    return { success: "Your affiliate access request was sent. The EdiCut team will review it and follow up by email." };
  }

  return { error: "This action is not available in this workspace section." };
  } catch (error) {
    if (isMissingWorkspaceSchema(error)) return { error: WORKSPACE_MIGRATION_NOTICE };
    throw error;
  }
}

export default function DashboardWorkspaceSection() {
  const { user, allowedFeatures, section, config, projects, projectOptions, files, reviews, workspaceReady, checkoutRequestSaved } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const [packageSlug, setPackageSlug] = useState("creator");
  const [includeRuntime, setIncludeRuntime] = useState(false);
  const [includeRaw, setIncludeRaw] = useState(false);
  const selectedPackage = SUBSCRIPTION_PACKAGES.find((item) => item.slug === packageSlug) ?? SUBSCRIPTION_PACKAGES[0];
  const estimatedMonthlyTotal = useMemo(
    () => getCheckoutTotal(selectedPackage, { runtime: includeRuntime, raw: includeRaw }),
    [includeRuntime, includeRaw, selectedPackage],
  );
  const displayName = user.name || user.email;
  const visibleNavItems = userNavItems.filter((item) => allowedFeatures.includes(item.feature));
  const packageNames = new Map(SUBSCRIPTION_PACKAGES.map((item) => [item.slug, item.name]));
  const projectNames = new Map(projectOptions.map((project) => [project.id, project.title]));
  const reviewQueue = projects.filter((project) => project.status === "review" || project.status === "client_review");

  return (
    <WorkspaceShell
      title={config.title}
      subtitle={`${normalizeRole(user.role)} workspace`}
      navItems={visibleNavItems.map(({ label, icon, path }) => ({ label, icon, to: path, end: path === "/dashboard" }))}
      account={{ name: displayName, detail: normalizeRole(user.role), imageUrl: user.profileImageUrl }}
      mobileMenu
      hideMobileHeading
      profileTo="/dashboard/profile"
      settingsTo="/dashboard/settings"
      notificationCount={reviewQueue.length}
      accountAction={(
        <Form method="post">
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" className="text-[#687583] transition hover:text-[#17202a]" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
          </button>
        </Form>
      )}
      headerActions={(
        <Link to="/dashboard/projects" className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex">
          <span className="material-symbols-outlined text-[17px]" aria-hidden="true">arrow_back</span>
          Projects
        </Link>
      )}
    >
      <div className="grid gap-5">
        <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="workspace-section-title">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="neo-icon-badge neo-workspace__module-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
                <span className="material-symbols-outlined text-[24px]" aria-hidden="true">{config.icon}</span>
              </span>
              <div>
                <p className="neo-workspace__eyebrow">Customer workspace</p>
                <h2 id="workspace-section-title" className="neo-workspace__module-title mt-1">{config.label}</h2>
                <p className="neo-workspace__module-copy mt-2 max-w-2xl">{config.description}</p>
              </div>
            </div>
            {section === "projects" ? (
              <a href="#new-project" className="neo-workspace__secondary-action inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-xs font-black">
                <span className="material-symbols-outlined text-[17px]" aria-hidden="true">add</span>
                New project
              </a>
            ) : null}
          </div>
          <ActionFeedback error={actionData?.error} success={actionData?.success} />
          {checkoutRequestSaved ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800" role="status">Your project request was saved. The monthly estimate is listed below; EdiCut will confirm scope and billing with you.</p> : null}
          {!workspaceReady ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="status">{WORKSPACE_MIGRATION_NOTICE}</p> : null}
        </section>

        {section === "projects" ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Your projects">
              {projects.length ? projects.map((project) => (
                <article key={project.id} className="neo-workspace__panel rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-black text-[#17202a]">{project.title}</h3>
                      <p className="mt-1 truncate text-xs font-bold text-[#73808b]">{project.channelName}</p>
                    </div>
                    <StatusPill status={project.status} />
                  </div>
                  <div className="mt-4 grid gap-2 border-t border-[#edf0f2] pt-3 text-xs text-[#687583]">
                    <p><span className="font-bold">Package:</span> {packageNames.get(project.packageSlug) ?? project.packageSlug}</p>
                    <p><span className="font-bold">Monthly plan estimate:</span> {formatMoney(project.estimatedAmountCents, project.currency)}</p>
                    {project.category ? <p><span className="font-bold">Category:</span> {project.category}</p> : null}
                    {project.cadence ? <p><span className="font-bold">Publishing cadence:</span> {project.cadence}</p> : null}
                    {project.deadline ? <p><span className="font-bold">Target date:</span> {new Date(`${project.deadline}T00:00:00`).toLocaleDateString()}</p> : null}
                    <p><span className="font-bold">Files:</span> {files.filter((file) => file.projectId === project.id).length}</p>
                    <p><span className="font-bold">Updated:</span> {new Date(project.updatedAt).toLocaleDateString()}</p>
                  </div>
                  {project.notes ? <p className="mt-3 whitespace-pre-wrap border-t border-[#edf0f2] pt-3 text-xs leading-5 text-[#687583]">{project.notes}</p> : null}
                </article>
              )) : <EmptyCard title="Your project list is empty" copy="Create a project request below to give your editor the channel, package, target date, and style notes." />}
            </section>

            <section id="new-project" className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="new-project-title">
              <p className="neo-workspace__eyebrow">Project intake</p>
              <h2 id="new-project-title" className="neo-workspace__module-title mt-1">Start an editing request</h2>
              <p className="neo-workspace__module-copy mt-2">No payment is taken here. The team will confirm scope and send billing details before editing begins.</p>
              <Form method="post" className="mt-5 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="intent" value="create-project" />
                <TextField label="Project name" name="title" placeholder="e.g. May channel launch" maxLength={120} required />
                <TextField label="Channel name" name="channelName" placeholder="Your channel or brand" maxLength={120} required />
                <label className="grid gap-2 text-xs font-black text-[#536779]">
                  Editing package
                  <select name="packageSlug" value={packageSlug} onChange={(event) => setPackageSlug(event.currentTarget.value)} className="neo-workspace__profile-input h-12 rounded-xl px-3 text-sm font-bold" disabled={isSubmitting}>
                    {SUBSCRIPTION_PACKAGES.map((item) => <option key={item.slug} value={item.slug}>{item.name} · ${item.basePrice}/mo estimate</option>)}
                  </select>
                </label>
                <fieldset className="grid gap-2 sm:col-span-2">
                  <legend className="mb-2 text-xs font-black text-[#536779]">Optional monthly coverage</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="neo-card flex min-h-12 cursor-pointer items-center gap-3 rounded-xl p-3 text-xs font-bold text-[#536779]">
                      <input type="checkbox" name="runtime" value="1" checked={includeRuntime} onChange={(event) => setIncludeRuntime(event.currentTarget.checked)} disabled={isSubmitting} className="h-4 w-4 shrink-0 accent-[#6d55e8]" />
                      <span>Add 60 min finished runtime · +${selectedPackage.finishedRuntimePrice}/mo</span>
                    </label>
                    <label className="neo-card flex min-h-12 cursor-pointer items-center gap-3 rounded-xl p-3 text-xs font-bold text-[#536779]">
                      <input type="checkbox" name="raw" value="1" checked={includeRaw} onChange={(event) => setIncludeRaw(event.currentTarget.checked)} disabled={isSubmitting} className="h-4 w-4 shrink-0 accent-[#6d55e8]" />
                      <span>Add 600 min raw footage · +${selectedPackage.rawFootagePrice}/mo</span>
                    </label>
                  </div>
                  <p className="text-xs font-medium text-[#687583]" role="status" aria-live="polite" aria-atomic="true">Estimated total: {formatMoney(estimatedMonthlyTotal * 100, "USD")}/month. The team confirms scope and billing before work begins.</p>
                </fieldset>
                <TextField label="Content category" name="category" placeholder="Tech, gaming, lifestyle" maxLength={80} />
                <TextField label="Publishing cadence" name="cadence" placeholder="1–2 videos each week" maxLength={120} />
                <TextField label="Target date" name="deadline" type="date" />
                <label className="grid gap-2 text-xs font-black text-[#536779] sm:col-span-2">
                  Brief and style notes
                  <textarea name="notes" rows={4} maxLength={4000} placeholder="References, pacing, subtitles, motion graphics, and anything your editor should know." className="neo-workspace__profile-input rounded-xl p-3 text-sm font-medium outline-none" disabled={isSubmitting} />
                </label>
                <div className="sm:col-span-2 sm:flex sm:justify-end">
                  <button type="submit" disabled={isSubmitting} className="neo-workspace__profile-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-60 sm:w-auto">
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">send</span>
                    {isSubmitting ? "Saving request…" : "Send project request"}
                  </button>
                </div>
              </Form>
            </section>
          </>
        ) : null}

        {section === "reviews" ? (
          <section className="grid gap-4" aria-label="Cuts awaiting review">
            {reviewQueue.length ? reviewQueue.map((project) => (
              <article key={project.id} className="neo-workspace__panel rounded-[24px] p-5 sm:p-7">
                {(() => {
                  const reviewCut = files
                    .filter((file) => file.projectId === project.id && file.kind === "review")
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
                  return reviewCut ? (
                    <a href={reviewCut.shareUrl} target="_blank" rel="noopener noreferrer" className="mb-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#f0ecfb] px-4 text-xs font-black text-[#6550c7] underline">
                      <span className="material-symbols-outlined text-[17px]" aria-hidden="true">play_circle</span>
                      Open {reviewCut.fileName}
                    </a>
                  ) : <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">The review link is missing. Contact your project manager before submitting feedback.</p>;
                })()}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="neo-workspace__eyebrow">Submitted cut</p><h3 className="neo-workspace__module-title mt-1">{project.title}</h3></div>
                  <StatusPill status={project.status} />
                </div>
                <p className="neo-workspace__module-copy mt-3">Review the cut with your editor’s link, then approve it or send a revision request with specific notes.</p>
                <Form method="post" className="mt-4 grid gap-4 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-end">
                  <input type="hidden" name="intent" value="submit-review" />
                  <input type="hidden" name="projectId" value={project.id} />
                  <label className="grid gap-2 text-xs font-black text-[#536779]">
                    Your decision
                    <select name="decision" defaultValue="approved" className="neo-workspace__profile-input h-12 rounded-xl px-3 text-sm font-bold" disabled={isSubmitting}>
                      <option value="approved">Approve this cut</option>
                      <option value="revision_requested">Request revisions</option>
                    </select>
                  </label>
                  <label className="grid gap-2 text-xs font-black text-[#536779]">
                    Review note <span className="font-medium">(required for revisions)</span>
                    <input name="feedback" maxLength={4000} placeholder="Add a timestamp and the change you need" className="neo-workspace__profile-input h-12 rounded-xl px-4 text-sm font-medium" disabled={isSubmitting} />
                  </label>
                  <button type="submit" disabled={isSubmitting} className="neo-workspace__profile-submit h-12 rounded-xl px-5 text-sm font-black disabled:opacity-60">{isSubmitting ? "Sending…" : "Send review"}</button>
                </Form>
              </article>
            )) : <EmptyCard title="No cuts are waiting for review" copy="When your editor submits a cut, it will appear here with approval and revision actions." />}
            {reviews.length ? (
              <section className="neo-workspace__panel rounded-[24px] p-5" aria-labelledby="review-history-title">
                <h2 id="review-history-title" className="text-base font-black text-[#17202a]">Review history</h2>
                <ul className="mt-3 divide-y divide-[#edf0f2]">
                  {reviews.map((review) => <li key={review.id} className="py-3 text-sm"><span className="font-bold">{projectNames.get(review.projectId) ?? "Project"}</span><span className="mx-2 text-[#9aa4ac]">·</span><span>{review.decision === "approved" ? "Approved" : "Revision requested"}</span>{review.feedback ? <p className="mt-1 text-xs text-[#687583]">{review.feedback}</p> : null}</li>)}
                </ul>
              </section>
            ) : null}
          </section>
        ) : null}

        {section === "uploads" ? (
          <>
            <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="add-file-title">
              <p className="neo-workspace__eyebrow">Attach source material</p>
              <h2 id="add-file-title" className="neo-workspace__module-title mt-1">Add a file sharing link</h2>
              <p className="neo-workspace__module-copy mt-2">Keep large footage in your own Drive, Dropbox, OneDrive, or Frame.io account. EdiCut saves the HTTPS link and label; grant your editor access in that storage service.</p>
              {projects.length ? (
                <Form method="post" className="mt-5 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="intent" value="add-file-link" />
                  <label className="grid gap-2 text-xs font-black text-[#536779]">
                    Project
                    <select name="projectId" required className="neo-workspace__profile-input h-12 rounded-xl px-3 text-sm font-bold" disabled={isSubmitting}>
                      <option value="">Choose a project</option>
                      {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
                    </select>
                  </label>
                  <TextField label="File or folder label" name="fileName" placeholder="Raw footage · episode 4" maxLength={160} required />
                  <div className="sm:col-span-2"><TextField label="HTTPS sharing link" name="shareUrl" placeholder="https://drive.google.com/…" maxLength={2048} required type="url" /></div>
                  <div className="sm:col-span-2 sm:flex sm:justify-end"><button type="submit" disabled={isSubmitting} className="neo-workspace__profile-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-60 sm:w-auto"><span className="material-symbols-outlined text-[18px]" aria-hidden="true">add_link</span>{isSubmitting ? "Adding link…" : "Add to project"}</button></div>
                </Form>
              ) : <p className="mt-4 rounded-xl bg-[#f5f6fa] p-4 text-sm text-[#536779]">Create a project before adding its source files. <Link to="/dashboard/projects#new-project" className="font-black text-[#6d55e8] underline">Start a project</Link></p>}
            </section>
            <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="files-title">
              <h2 id="files-title" className="text-base font-black text-[#17202a]">Shared files</h2>
              {files.length ? <ul className="mt-3 divide-y divide-[#edf0f2]">{files.map((file) => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-bold">{file.fileName}</p><p className="mt-1 text-xs text-[#687583]">{file.kind === "review" ? "Review cut" : "Source file"} · {projectNames.get(file.projectId) ?? "Project"} · {new Date(file.createdAt).toLocaleDateString()}</p></div><div className="flex items-center gap-4"><a href={file.shareUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-black text-[#6d55e8] underline">Open shared link</a>{file.kind === "source" ? <Form method="post" onSubmit={(event) => { if (!window.confirm(`Remove “${file.fileName}” from this workspace? The original file will stay in your storage.`)) event.preventDefault(); }}><input type="hidden" name="intent" value="remove-file-link" /><input type="hidden" name="fileId" value={file.id} /><button type="submit" disabled={isSubmitting} className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-black text-red-700 underline disabled:opacity-50" aria-label={`Remove ${file.fileName} source link`}>Remove</button></Form> : null}</div></li>)}</ul> : <p className="mt-3 text-sm text-[#687583]">File links you attach to a project will appear here.</p>}
            </section>
          </>
        ) : null}

        {section === "billing" ? (
          <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="billing-title">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="neo-workspace__eyebrow">Project estimates</p><h2 id="billing-title" className="neo-workspace__module-title mt-1">Billing history</h2></div><Link to="/dashboard/projects#new-project" className="neo-workspace__secondary-action inline-flex h-10 items-center justify-center rounded-full px-4 text-xs font-black">Request a project</Link></div>
            <p className="neo-workspace__module-copy mt-2">Estimates are not invoices. Your final quote and any external invoice or payment link appear after the EdiCut team confirms scope. This site does not collect card details.</p>
            {projects.length ? <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-[#edf0f2] text-xs uppercase tracking-wide text-[#7b8790]"><th className="px-3 py-3">Project</th><th className="px-3 py-3">Package</th><th className="px-3 py-3">Estimate</th><th className="px-3 py-3">Final quote</th><th className="px-3 py-3">Billing</th></tr></thead><tbody>{projects.map((project) => <tr key={project.id} className="border-b border-[#f1f3f5]"><td className="px-3 py-3 font-bold">{project.title}<span className="block text-xs font-medium text-[#84909a]">{new Date(project.createdAt).toLocaleDateString()}</span></td><td className="px-3 py-3">{packageNames.get(project.packageSlug) ?? project.packageSlug}</td><td className="px-3 py-3 font-bold">{formatMoney(project.estimatedAmountCents, project.currency)}</td><td className="px-3 py-3 font-bold">{project.finalAmountCents == null ? "Awaiting quote" : formatMoney(project.finalAmountCents, project.currency)}</td><td className="px-3 py-3"><div className="grid justify-items-start gap-2"><StatusPill status={project.billingStatus} />{project.invoiceUrl ? <a href={project.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-black text-[#6d55e8] underline">Open invoice or payment link</a> : null}</div></td></tr>)}</tbody></table></div> : <p className="mt-5 rounded-xl bg-[#f5f6fa] p-4 text-sm text-[#536779]">Project estimates will appear here after you send a project request.</p>}
          </section>
        ) : null}

        {section === "settings" ? (
          <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="settings-title">
            <p className="neo-workspace__eyebrow">Account security</p><h2 id="settings-title" className="neo-workspace__module-title mt-1">Profile and sign-in</h2>
            <p className="neo-workspace__module-copy mt-2">Your workspace uses your account profile for contact details and sign-in identity.</p>
            <dl className="mt-5 grid gap-4 rounded-2xl bg-[#f5f6fa] p-4 sm:grid-cols-2"><div><dt className="text-[10px] font-black uppercase tracking-wide text-[#7b8790]">Name</dt><dd className="mt-1 text-sm font-bold text-[#17202a]">{user.name || "Add your name"}</dd></div><div><dt className="text-[10px] font-black uppercase tracking-wide text-[#7b8790]">Email</dt><dd className="mt-1 break-all text-sm font-bold text-[#17202a]">{user.email}</dd></div></dl>
            <div className="mt-5 flex flex-wrap gap-3"><Link to="/dashboard/profile" className="neo-workspace__profile-submit inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-black">Edit profile</Link><Link to="/forgot-password" className="neo-workspace__secondary-action inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-black">Reset password</Link></div>
          </section>
        ) : null}

        {section === "affiliates" ? (
          <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="affiliate-access-title">
            <p className="neo-workspace__eyebrow">Affiliate access</p>
            <h2 id="affiliate-access-title" className="neo-workspace__module-title mt-1">Request an affiliate profile</h2>
            <p className="neo-workspace__module-copy mt-2">Referral tracking is not active for this account yet. Send your channel or website to the EdiCut team; they will review your request and confirm program terms before enabling a referral profile.</p>
            <Form method="post" className="mt-5 grid gap-4">
              <input type="hidden" name="intent" value="request-affiliate-access" />
              <TextField label="Channel or website link" name="channelUrl" placeholder="https://…" type="url" maxLength={2048} />
              <label className="grid gap-2 text-xs font-black text-[#536779]">
                Tell us about your audience
                <textarea name="notes" rows={4} maxLength={4000} placeholder="What do you create, and who follows your work?" className="neo-workspace__profile-input rounded-xl p-3 text-sm font-medium outline-none" disabled={isSubmitting} />
              </label>
              <p className="text-xs font-medium text-[#687583]">No referral code or commission is activated by this request. The team will email you after review.</p>
              <div className="sm:flex sm:justify-end"><button type="submit" disabled={isSubmitting} className="neo-workspace__profile-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-60 sm:w-auto"><span className="material-symbols-outlined text-[18px]" aria-hidden="true">send</span>{isSubmitting ? "Sending request…" : "Request access"}</button></div>
            </Form>
          </section>
        ) : null}
      </div>
    </WorkspaceShell>
  );
}

function TextField({ label, name, placeholder, type = "text", maxLength, required = false }: { label: string; name: string; placeholder?: string; type?: string; maxLength?: number; required?: boolean }) {
  return <label className="grid gap-2 text-xs font-black text-[#536779]">{label}<input type={type} name={name} placeholder={placeholder} maxLength={maxLength} required={required} className="neo-workspace__profile-input h-12 rounded-xl px-4 text-sm font-bold outline-none" /></label>;
}

function ActionFeedback({ error, success }: { error?: string; success?: string }) {
  return <>
    {error ? <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700" role="alert">{error}</p> : null}
    {success ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700" role="status">{success}</p> : null}
  </>;
}

function EmptyCard({ title, copy }: { title: string; copy: string }) {
  return <div className="neo-workspace__panel rounded-2xl p-6 sm:col-span-2 xl:col-span-3"><h3 className="text-base font-black text-[#17202a]">{title}</h3><p className="mt-2 max-w-2xl text-sm text-[#687583]">{copy}</p></div>;
}

function StatusPill({ status }: { status: string }) {
  const labels: Record<string, string> = {
    intake: "Intake",
    editing: "Editing",
    review: "Ready for review",
    client_review: "Ready for review",
    revision: "Revision requested",
    delivered: "Delivered",
    quote_requested: "Quote requested",
    quote_approved: "Quote confirmed",
    invoice_pending: "Invoice pending",
    paid: "Paid",
  };
  return <span className="inline-flex w-fit rounded-full bg-[#f0ecfb] px-3 py-1 text-[10px] font-black text-[#6550c7]">{labels[status] ?? status.replace(/[_-]/g, " ")}</span>;
}

function normalizeRole(role: string) {
  const labels: Record<string, string> = {
    admin: "Administrator",
    manager: "Editor manager",
    project_manager: "Editor manager",
    editor: "Editor",
    customer_support: "Customer support",
    affiliate: "Affiliate marketer",
    client: "Client",
    customer: "Client",
    user: "Client",
  };
  return labels[role] ?? role.replace(/[_-]/g, " ");
}
