import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useState } from "react";
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
import { getCheckoutTotal, SUBSCRIPTION_PACKAGES, type SubscriptionPackage } from "../lib/subscriptions";
import { configuredPublicEditingPackages, getPricingPackages } from "../lib/pricing.server";
import { isMissingWorkspaceSchema, isValidWorkspaceDate, isWorkspaceRecordId, parseWorkspaceShareUrl, WORKSPACE_MIGRATION_NOTICE } from "../lib/workspace";
import { workspaceProjectColumns, type WorkspaceProjectView } from "../lib/workspace-projects.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { getAffiliatePortalData, isMissingMarketingSchema, type AffiliatePortalData } from "../lib/marketing.server";
import { toPublicUser } from "../lib/admin-public";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";

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
    description: "Share your referral link and follow attributed orders and commissions.",
  },
  settings: {
    label: "Settings",
    icon: "settings",
    feature: "settings" as DashboardFeature,
    title: "Workspace settings",
    description: "Manage your sign-in and account security.",
  },
} as const;

type PlaceholderSection = keyof typeof sectionConfigs;

export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" }; }

const userNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", path: "/dashboard", feature: "overview" as DashboardFeature },
  { label: "Projects", icon: "video_library", path: "/dashboard/projects", feature: "projects" as DashboardFeature },
  { label: "Reviews", icon: "rate_review", path: "/dashboard/reviews", feature: "reviews" as DashboardFeature },
  { label: "Uploads", icon: "upload_file", path: "/dashboard/uploads", feature: "uploads" as DashboardFeature },
  { label: "Enquiries", icon: "mail", path: "/dashboard/messages", feature: "support" as DashboardFeature },
  { label: "Subscriptions", icon: "receipt_long", path: "/dashboard/subscriptions", feature: "billing" as DashboardFeature },
  { label: "Affiliates", icon: "hub", path: "/dashboard/affiliates", feature: "affiliates" as DashboardFeature },
];

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: `${data?.config.label ?? "Workspace"} | EdiCut` },
  { name: "robots", content: "noindex,nofollow" },
];

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  if (params.section === "billing") throw redirect("/dashboard/subscriptions");
  const section = params.section as PlaceholderSection | undefined;
  const config = section ? sectionConfigs[section] : undefined;
  if (!section || !config) throw redirect("/dashboard");

  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);

  if (!user?.active || user.deletedAt) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin?redirectTo=/dashboard", {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }

  const roleFeatureAccess = await getRoleFeatureAccessSettings(db, context);
  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);
  if (!canAccessDashboardFeature(user.role, config.feature, roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(allowedFeatures));
  }

  const requirements = getWorkspaceDataRequirements(section);
  let projects: WorkspaceProjectView[] = [];
  let projectOptions: Array<Pick<typeof workspaceProjects.$inferSelect, "id" | "title">> = [];
  let files: (typeof workspaceProjectFiles.$inferSelect)[] = [];
  let reviews: (typeof workspaceProjectReviews.$inferSelect)[] = [];
  let workspaceReady = true;
  try {
    const ownerFilter = eq(workspaceProjects.ownerId, userId);
    const [projectRows, projectNameRows, fileRows, reviewRows] = await Promise.all([
      requirements.projects
        ? db.select(workspaceProjectColumns).from(workspaceProjects).where(ownerFilter).orderBy(desc(workspaceProjects.updatedAt))
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

  let affiliateData: AffiliatePortalData | null = null;
  let affiliateSchemaReady = true;
  if (section === "affiliates") {
    try {
      affiliateData = await getAffiliatePortalData(db, userId, new URL(request.url).origin);
    } catch (error) {
      if (!isMissingMarketingSchema(error)) throw error;
      affiliateSchemaReady = false;
    }
  }

  const pricingPackages = section === "projects"
    ? configuredPublicEditingPackages(await getPricingPackages(db, context)).filter((item): item is SubscriptionPackage => item.packageType === "monthly")
    : [];

  return { user: toPublicUser(user), allowedFeatures, section, config, projects, projectOptions, files, reviews, workspaceReady, checkoutRequestSaved, affiliateData, affiliateSchemaReady, pricingPackages };
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "This request is too large. Please shorten the details and try again." };
  }

  const section = params.section as PlaceholderSection | undefined;
  const formData = await readMutationForm(request, 64 * 1024);
  if (!formData) return { error: "Submit a valid workspace form under 64 KB." };
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
  const actionLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "USER_ACTION_LIMITER",
    key: `user:${userId}`,
    localLimit: 60,
    localPeriodSeconds: 60,
  });
  if (actionLimit !== "allowed") {
    return {
      error: actionLimit === "limited"
        ? "You have submitted several requests. Wait a minute and try again."
        : "Usage protection is temporarily unavailable. Please try again shortly.",
    };
  }

  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  if (!user?.active || user.deletedAt) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin?redirectTo=/dashboard", { headers: { "Set-Cookie": await destroySession(session, context) } });
  }
  const roleFeatureAccess = await getRoleFeatureAccessSettings(db, context);
  if (!canAccessDashboardFeature(user.role, config.feature, roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(getAllowedDashboardFeatures(user.role, roleFeatureAccess)));
  }

  try {
  if (section === "projects") throw redirect("/dashboard/projects");

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
  const { user, allowedFeatures, section, config, projects, projectOptions, files, reviews, workspaceReady, checkoutRequestSaved, affiliateData, affiliateSchemaReady, pricingPackages } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  const [packageSlug, setPackageSlug] = useState(() => pricingPackages.find((item) => item.slug === "creator")?.slug ?? pricingPackages[0]?.slug ?? "creator");
  const selectedPackage = pricingPackages.find((item) => item.slug === packageSlug) ?? pricingPackages[0] ?? SUBSCRIPTION_PACKAGES[0];
  const estimatedMonthlyTotal = getCheckoutTotal(selectedPackage);
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
      navigationFeedback
      hideMobileHeading
      profileTo={allowedFeatures.includes("settings") ? "/dashboard/profile" : null}
      profileNavAtBottom
      settingsTo={allowedFeatures.includes("settings") ? "/dashboard/settings" : null}
      startProjectTo={allowedFeatures.includes("projects") ? "/dashboard/projects#new-project" : null}
      notificationsTo={allowedFeatures.includes("reviews") ? "/dashboard/reviews" : null}
      notificationCount={reviewQueue.length}
      accountAction={(
        <Form method="post">
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" className="text-[#687583] transition hover:text-[#17202a]" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
          </button>
        </Form>
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
          {checkoutRequestSaved ? <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800" role="status">Your project request was saved. EdiCut will confirm the package scope and billing with you.</p> : null}
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
                    {pricingPackages.map((item) => <option key={item.slug} value={item.slug}>{item.name} · {formatMoney(item.basePrice * 100, "USD")}/month</option>)}
                  </select>
                </label>
                <div className="neo-card grid gap-2 rounded-xl p-4 text-xs font-medium text-[#536779] sm:col-span-2">
                  <p className="font-black text-[#17202a]">Included scope</p>
                  {selectedPackage.packageType === "monthly" ? <>
                    <p>{selectedPackage.editingHoursPerMonth} editing hours per month</p>
                    <p>{selectedPackage.editingHoursPerWorkday} {selectedPackage.editingHoursPerWorkday === 1 ? "hour" : "hours"} per workday · 22 working days per month</p>
                    <p>Editing and revisions use the reserved monthly hours</p>
                  </> : null}
                  <p className="mt-1 font-black text-[#17202a]" role="status" aria-live="polite" aria-atomic="true">Monthly package price: {formatMoney(estimatedMonthlyTotal * 100, "USD")}</p>
                  <p>Work beyond these limits is quoted separately before editing begins.</p>
                </div>
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
            <p className="neo-workspace__eyebrow">Account security</p><h2 id="settings-title" className="neo-workspace__module-title mt-1">Sign-in and security</h2>
            <p className="neo-workspace__module-copy mt-2">Manage your password and keep your sign-in secure.</p>
            <div className="mt-5 flex flex-wrap gap-3"><Link to="/dashboard/profile" className="neo-workspace__profile-submit inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-black">Manage profile</Link><Link to="/forgot-password" className="neo-workspace__secondary-action inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-black">Reset password</Link></div>
          </section>
        ) : null}

        {section === "affiliates" ? (
          affiliateSchemaReady
            ? affiliateData
              ? <AffiliatePortal affiliate={affiliateData} />
              : <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="affiliate-access-title">
                <p className="neo-workspace__eyebrow">Affiliate access</p>
                <h2 id="affiliate-access-title" className="neo-workspace__module-title mt-1">Request an affiliate profile</h2>
                <p className="neo-workspace__module-copy mt-2">Send your channel or website to the EdiCut team. They will review your audience and confirm program terms before enabling a referral profile.</p>
                <Form method="post" className="mt-5 grid gap-4">
                  <input type="hidden" name="intent" value="request-affiliate-access" />
                  <TextField label="Channel or website link" name="channelUrl" placeholder="https://…" type="url" maxLength={2048} />
                  <label className="grid gap-2 text-xs font-black text-[#536779]">
                    Tell us about your audience
                    <textarea name="notes" rows={4} maxLength={4000} placeholder="What do you create, and who follows your work?" className="neo-workspace__profile-input rounded-xl p-3 text-sm font-medium outline-none" disabled={isSubmitting} />
                  </label>
                  <p className="text-xs font-medium text-[#687583]">Submitting this request does not activate a referral code or commission. The team will email you after review.</p>
                  <div className="sm:flex sm:justify-end"><button type="submit" disabled={isSubmitting} className="neo-workspace__profile-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-60 sm:w-auto"><span className="material-symbols-outlined text-[18px]" aria-hidden="true">send</span>{isSubmitting ? "Sending request…" : "Request access"}</button></div>
                </Form>
              </section>
            : <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" role="status"><p className="neo-workspace__eyebrow">Affiliate reporting</p><h2 className="neo-workspace__module-title mt-1">Temporarily unavailable</h2><p className="neo-workspace__module-copy mt-2">Affiliate reporting is temporarily unavailable until the required database migrations are applied.</p></section>
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

function AffiliatePortal({ affiliate }: { affiliate: AffiliatePortalData }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const rows = affiliate.orders;
  const orderName = (label: string, kind: AffiliatePortalData["orders"][number]["kind"]) => kind !== "project"
    ? label
    : SUBSCRIPTION_PACKAGES.find((item) => item.slug === label)?.name ?? label;
  const orderStatus = (status: string) => status === "paid" ? "Paid" : status === "unpaid" ? "Unpaid" : status.replaceAll("_", " ");

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(affiliate.referralUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return (
    <div className="grid gap-5 sm:gap-6">
      <section className="neo-workspace__panel rounded-[24px] p-5 sm:p-7" aria-labelledby="affiliate-overview-title">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="neo-workspace__eyebrow">Partner overview</p>
            <h2 id="affiliate-overview-title" className="neo-workspace__module-title mt-1">Your referral performance</h2>
            <p className="neo-workspace__module-copy mt-2 max-w-2xl">Share your link to refer new customers. Commissions are recorded after EdiCut marks an attributed order as paid; payout arrangements are confirmed separately.</p>
          </div>
          <span className={`inline-flex min-h-8 items-center rounded-full px-3 text-xs font-black ${affiliate.active ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"}`}>
            {affiliate.active ? "Active" : "Paused"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid min-w-0 gap-2 text-xs font-black text-[#536779]" htmlFor="affiliate-referral-url">
            Referral link
            <input id="affiliate-referral-url" readOnly value={affiliate.referralUrl} className="neo-workspace__profile-input h-11 min-w-0 rounded-xl px-3 text-sm font-semibold" onFocus={(event) => event.currentTarget.select()} />
          </label>
          <button type="button" onClick={() => void copyReferralLink()} disabled={!affiliate.active} className="neo-workspace__profile-submit inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">content_copy</span>
            {copyStatus === "copied" ? "Copied" : "Copy link"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-[#687583]">
          <span>Referral code: <strong className="text-[#17202a]">{affiliate.code}</strong></span>
          <span>Commission rate: <strong className="text-[#17202a]">{(affiliate.commissionRateBps / 100).toFixed(2)}%</strong></span>
          {copyStatus === "copied" ? <span role="status" aria-live="polite" className="text-emerald-800">Referral link copied.</span> : null}
          {copyStatus === "error" ? <span role="status" aria-live="polite">Copy failed. Select the link above and copy it.</span> : null}
        </div>
        {!affiliate.active ? <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">This referral code is paused. Contact EdiCut support if you think this is a mistake.</p> : null}
      </section>

      <section aria-label="Affiliate order summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AffiliateMetric label="Orders attributed" value={affiliate.orderCount.toLocaleString("en-US")} />
        <AffiliateMetric label="Paid orders" value={affiliate.paidOrderCount.toLocaleString("en-US")} />
        <AffiliateMetric label="Recorded commission" value={formatMoney(affiliate.commissionEarnedCents, "USD")} />
        <AffiliateMetric label="Estimated on unpaid orders" value={formatMoney(affiliate.pendingCommissionCents, "USD")} />
      </section>

      <section className="neo-workspace__panel min-w-0 rounded-[24px] p-5 sm:p-7" aria-labelledby="affiliate-orders-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="neo-workspace__eyebrow">Attributed activity</p><h2 id="affiliate-orders-title" className="neo-workspace__module-title mt-1">Recent orders</h2></div>
          <p className="max-w-xl text-xs leading-5 text-[#687583]">Order totals and commission appear after an order is paid. Unpaid estimates are not earned commission.</p>
        </div>
        {rows.length ? (
          <>
            <ul className="mt-5 grid gap-3 sm:hidden">
              {rows.map((order) => (
                <li key={`${order.kind}-${order.id}`} className="rounded-2xl border border-[#e2e7eb] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm font-black text-[#17202a]">{orderName(order.label, order.kind)}</p><p className="mt-1 text-xs text-[#687583]">{order.kind === "project" ? "Project request" : "Package purchase"} · {formatAffiliateDate(order.createdAt)}</p></div>
                    <AffiliateOrderStatus status={orderStatus(order.status)} paid={order.status === "paid"} />
                  </div>
                  <div className="mt-3 flex justify-between border-t border-[#edf0f2] pt-3 text-xs"><span className="text-[#687583]">Commission</span><strong className="text-[#17202a]">{order.status === "paid" ? formatMoney(order.commissionCents, order.currency) : order.pendingCommissionCents ? `${formatMoney(order.pendingCommissionCents, order.currency)} estimated` : "Not earned"}</strong></div>
                </li>
              ))}
            </ul>
            <div className="mt-5 hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[650px] text-left text-sm">
                <caption className="sr-only">Orders attributed to your referral code</caption>
                <thead><tr className="border-b border-[#e2e7eb] text-xs font-black uppercase tracking-wide text-[#687583]"><th scope="col" className="px-3 py-3">Order</th><th scope="col" className="px-3 py-3">Type</th><th scope="col" className="px-3 py-3">Date</th><th scope="col" className="px-3 py-3">Status</th><th scope="col" className="px-3 py-3 text-right">Commission</th></tr></thead>
                <tbody>{rows.map((order) => <tr key={`${order.kind}-${order.id}`} className="border-b border-[#f0f2f4]"><th scope="row" className="px-3 py-3 font-bold text-[#17202a]">{orderName(order.label, order.kind)}</th><td className="px-3 py-3 text-[#536779]">{order.kind === "project" ? "Project" : "Package purchase"}</td><td className="px-3 py-3 text-[#536779]">{formatAffiliateDate(order.createdAt)}</td><td className="px-3 py-3"><AffiliateOrderStatus status={orderStatus(order.status)} paid={order.status === "paid"} /></td><td className="px-3 py-3 text-right font-bold text-[#17202a]">{order.status === "paid" ? formatMoney(order.commissionCents, order.currency) : order.pendingCommissionCents ? `${formatMoney(order.pendingCommissionCents, order.currency)} estimated` : "Not earned"}</td></tr>)}</tbody>
              </table>
            </div>
          </>
        ) : <p className="mt-5 rounded-2xl bg-[#f5f6fa] p-5 text-sm text-[#536779]">No orders are linked to your code yet. Share your referral link to get started.</p>}
      </section>
    </div>
  );
}

function AffiliateMetric({ label, value }: { label: string; value: string }) {
  return <div className="neo-workspace__panel rounded-2xl p-4 sm:p-5"><p className="text-xs font-bold text-[#687583]">{label}</p><p className="mt-2 break-words text-xl font-black tracking-tight text-[#17202a]">{value}</p></div>;
}

function AffiliateOrderStatus({ status, paid }: { status: string; paid: boolean }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-950"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${paid ? "bg-emerald-700" : "bg-amber-700"}`} />{status}</span>;
}

function formatAffiliateDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
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
