import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { eq } from "drizzle-orm";
import { users } from "@edicut/db/schema";
import { Form, Link, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { destroySession, getSession, requireUserId } from "../lib/session.server";
import { getDbFromContext } from "../lib/db.server";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import {
  canAccessDashboardFeature,
  getAllowedDashboardFeatures,
  getDashboardLandingPath,
  type DashboardFeature,
} from "../lib/role-feature-access";
import { findUserById } from "@edicut/db/repositories/users";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { toPublicUser } from "../lib/admin-public";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { CreatorPlatformField, IntakeErrors, IntakeField } from "../components/ClientIntakeFields";
import { inferCreatorPlatform, validateCreatorProfile, type CreatorProfile } from "../lib/client-intake";
import { isMissingClientWorkspaceSchema, loadClientWorkspace, saveCreatorProfile } from "../lib/client-workspace.server";

const userNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", path: "/dashboard", feature: "overview" as DashboardFeature },
  { label: "Projects", icon: "video_library", path: "/dashboard/projects", feature: "projects" as DashboardFeature },
  { label: "Reviews", icon: "rate_review", path: "/dashboard/reviews", feature: "reviews" as DashboardFeature },
  { label: "Uploads", icon: "upload_file", path: "/dashboard/uploads", feature: "uploads" as DashboardFeature },
  { label: "Enquiries", icon: "mail", path: "/dashboard/messages", feature: "support" as DashboardFeature },
  { label: "Subscriptions", icon: "receipt_long", path: "/dashboard/subscriptions", feature: "billing" as DashboardFeature },
  { label: "Affiliates", icon: "hub", path: "/dashboard/affiliates", feature: "affiliates" as DashboardFeature },
];

type ProfileActionData = {
  error?: string;
  success?: string;
  channelError?: string;
  channelSuccess?: string;
  channelErrors?: Record<string, string>;
  channelValues?: Record<string, string>;
};

export const meta: MetaFunction = () => [
  { title: "Profile settings - EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "same-origin" }; }

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);

  if (!user?.active || user.deletedAt) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin?redirectTo=/dashboard/profile", {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }

  const roleFeatureAccess = await getRoleFeatureAccessSettings(db, context);
  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);
  if (!canAccessDashboardFeature(user.role, "settings", roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(allowedFeatures));
  }

  let channelProfile: CreatorProfile | null = null;
  let channelSchemaReady = false;
  let hasConfirmedPurchase = false;
  if (allowedFeatures.includes("billing")) {
    try {
      const workspace = await loadClientWorkspace(db, userId);
      channelProfile = workspace.profile;
      channelSchemaReady = true;
      hasConfirmedPurchase = workspace.purchases.length > 0;
    } catch (error) {
      if (!isMissingClientWorkspaceSchema(error)) throw error;
    }
  }
  return { user: toPublicUser(user), allowedFeatures, channelProfile, channelSchemaReady, hasConfirmedPurchase };
}

export async function action({ request, context }: ActionFunctionArgs): Promise<ProfileActionData | Response> {
  if (!isSameSiteMutation(request)) return forbiddenMutation();
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "This profile request is too large." };
  }

  const formData = await readMutationForm(request, 64 * 1024);
  if (!formData) return { error: "Submit a valid profile form under 64 KB." };
  const intent = readText(formData, "intent");

  if (intent === "logout") {
    const session = await getSession(request.headers.get("Cookie"), context);
    return redirect("/signin?redirectTo=/dashboard", {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }

  if (intent !== "save-profile" && intent !== "save-channel") return { error: "Choose a profile action." };

  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  if (!user?.active || user.deletedAt) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin?redirectTo=/dashboard/profile", { headers: { "Set-Cookie": await destroySession(session, context) } });
  }

  const roleFeatureAccess = await getRoleFeatureAccessSettings(db, context);
  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);
  if (!canAccessDashboardFeature(user.role, "settings", roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(allowedFeatures));
  }

  const actionLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "USER_ACTION_LIMITER",
    key: `user:${userId}`,
    localLimit: 60,
    localPeriodSeconds: 60,
  });
  if (actionLimit !== "allowed") {
    const message = actionLimit === "limited"
      ? "You have submitted several requests. Wait a minute and try again."
      : "Usage protection is temporarily unavailable. Please try again shortly.";
    return intent === "save-channel" ? { channelError: message } : { error: message };
  }

  if (intent === "save-channel") {
    if (!allowedFeatures.includes("billing")) return { channelError: "Creator profile editing is not enabled for this account." };
    const channelValues = Object.fromEntries([...formData].filter((entry): entry is [string, string] => typeof entry[1] === "string")) as Record<string, string>;
    const channelResult = validateCreatorProfile(formData);
    if (channelResult.errors) return { channelErrors: channelResult.errors, channelValues };

    try {
      if (!await saveCreatorProfile(db, userId, channelResult.value)) {
        return { channelError: "A confirmed package purchase is required before setting up your creator profile.", channelValues };
      }
      return { channelSuccess: "Your creator profile has been updated." };
    } catch (error) {
      if (!isMissingClientWorkspaceSchema(error)) throw error;
      return { channelError: "Creator profile settings are temporarily unavailable. Please try again later.", channelValues };
    }
  }

  const name = readText(formData, "name");
  const phone = readText(formData, "phone");

  if (!name || name.length > 100) {
    return { error: "Enter a name between 1 and 100 characters." };
  }
  if (phone.length > 32) {
    return { error: "Phone numbers can be up to 32 characters." };
  }

  const [updatedUser] = await db
    .update(users)
    .set({ name, phone: phone || null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) return { error: "Your profile could not be found. Please sign in again." };
  return { success: "Your profile has been updated." };
}

export default function DashboardProfileRoute() {
  const { user, allowedFeatures, channelProfile, channelSchemaReady, hasConfirmedPurchase } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const displayName = user.name || user.email;
  const visibleNavItems = userNavItems.filter((item) => allowedFeatures.includes(item.feature));
  const channelValues: Record<string, string> = {
    channelName: channelProfile?.channelName ?? "",
    platform: channelProfile?.platform ?? inferCreatorPlatform(channelProfile?.channelUrl ?? ""),
    channelUrl: channelProfile?.channelUrl ?? "",
    brandUrl: channelProfile?.brandUrl ?? "",
    ...actionData?.channelValues,
  };

  return (
    <WorkspaceShell
      title="Profile settings"
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
      accountAction={(
        <Form method="post">
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" className="text-[#687583] transition hover:text-[#17202a]" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
          </button>
        </Form>
      )}
    >
      <div className="mx-auto max-w-4xl">
        <nav className="mb-5 flex flex-wrap gap-2" aria-label="Profile sections">
          <a href="#account-profile" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--workspace-line)] bg-white/55 px-4 text-sm font-bold text-[#30445a] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7157ed]">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">person</span>
            Account details
          </a>
          {allowedFeatures.includes("billing") ? <a href="#channel-profile" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--workspace-line)] bg-white/55 px-4 text-sm font-bold text-[#30445a] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7157ed]">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">video_library</span>
            Creator profile
          </a> : null}
        </nav>

        <section id="account-profile" className="neo-workspace__panel scroll-mt-28 rounded-[26px] p-5 sm:p-7" aria-labelledby="profile-settings-title">
          <div className="border-b border-white/70 pb-5 sm:pb-6">
            <p className="neo-workspace__eyebrow">Your account</p>
            <h2 id="profile-settings-title" className="neo-workspace__module-title mt-1">Account details</h2>
            <p className="neo-workspace__module-copy mt-1">Contact information and sign-in details for your workspace.</p>
          </div>

          <Form method="post" className="mt-5 grid gap-4 sm:mt-6 sm:grid-cols-2 sm:gap-5">
            <input type="hidden" name="intent" value="save-profile" />
            {actionData?.error ? <p className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700" role="alert">{actionData.error}</p> : null}
            {actionData?.success ? <p className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700" role="status">{actionData.success}</p> : null}
            <label className="grid gap-2 text-xs font-black text-[#536779]">
              Full name
              <input
                className="neo-workspace__profile-input h-12 w-full rounded-xl px-4 text-sm font-bold outline-none disabled:opacity-60"
                type="text"
                name="name"
                autoComplete="name"
                maxLength={100}
                required
                defaultValue={user.name || ""}
                disabled={isSubmitting}
              />
            </label>
            <label className="grid gap-2 text-xs font-black text-[#536779]">
              Email address
              <input
                className="neo-workspace__profile-input h-12 w-full rounded-xl px-4 text-sm font-bold text-[#7b8792] outline-none"
                type="email"
                autoComplete="email"
                value={user.email}
                readOnly
                aria-describedby="profile-email-note"
              />
              <span id="profile-email-note" className="text-[10px] font-medium">Contact support to change your sign-in email.</span>
            </label>
            <label className="grid gap-2 text-xs font-black text-[#536779] sm:col-span-2">
              Phone number <span className="font-medium">(optional)</span>
              <input
                className="neo-workspace__profile-input h-12 w-full rounded-xl px-4 text-sm font-bold outline-none disabled:opacity-60"
                type="tel"
                name="phone"
                autoComplete="tel"
                maxLength={32}
                defaultValue={user.phone || ""}
                disabled={isSubmitting}
              />
            </label>
            <div className="sm:col-span-2 sm:flex sm:justify-end">
              <button type="submit" disabled={isSubmitting} className="neo-workspace__profile-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-60 sm:w-auto">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check</span>
                {isSubmitting ? "Saving…" : "Save profile"}
              </button>
            </div>
          </Form>
        </section>

      {allowedFeatures.includes("billing") ? <section id="channel-profile" className="neo-workspace__panel mt-5 scroll-mt-28 rounded-[26px] p-5 sm:p-7" aria-labelledby="channel-profile-title">
        <div className="border-b border-white/70 pb-5 sm:pb-6">
          <p className="neo-workspace__eyebrow">Creator profile</p>
          <h2 id="channel-profile-title" className="neo-workspace__module-title mt-1">Creator details</h2>
          <p className="neo-workspace__module-copy mt-1">Share the platform and public profile your editor should use for every project. Any creator platform or website works.</p>
        </div>
        {!channelSchemaReady ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900" role="status">Creator profile settings are temporarily unavailable while the workspace is updated.</p>
          : !hasConfirmedPurchase ? <div className="mt-5 rounded-xl border border-slate-200 bg-white/40 px-4 py-4 text-sm leading-6 text-slate-600">
            <p>A confirmed subscription is required before creator details can be saved.</p>
            {allowedFeatures.includes("billing") ? <Link to="/dashboard/subscriptions" className="mt-2 inline-flex min-h-11 items-center font-bold text-slate-900 underline underline-offset-4">View subscriptions</Link> : null}
          </div>
          : <Form method="post" className="mt-5">
            <input type="hidden" name="intent" value="save-channel" />
            <IntakeErrors error={actionData?.channelError} errors={actionData?.channelErrors} />
            {actionData?.channelSuccess ? <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700" role="status">{actionData.channelSuccess}</p> : null}
            <fieldset disabled={isSubmitting} className="min-w-0">
              <div className="grid gap-5 sm:grid-cols-2">
                <IntakeField name="channelName" label="Creator or brand name" values={channelValues} errors={actionData?.channelErrors} maxLength={120} hint="The name your editor should use in project notes." />
                <CreatorPlatformField values={channelValues} errors={actionData?.channelErrors} hint="Choose a platform, or select Other to enter any creator platform." />
                <div className="sm:col-span-2">
                  <IntakeField name="channelUrl" label="Public profile link" values={channelValues} errors={actionData?.channelErrors} type="url" hint="Paste the full HTTPS link to your profile, channel, podcast, or website." />
                </div>
                <div className="sm:col-span-2">
                  <IntakeField name="brandUrl" label="Brand assets folder" type="url" required={false} values={channelValues} errors={actionData?.channelErrors} hint="Optional. Share logos, fonts, and guidelines through a link your editor can access. Never share passwords." />
                </div>
              </div>
            </fieldset>
            <div className="mt-6 flex justify-end">
              <button disabled={isSubmitting} className="neo-workspace__profile-submit inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-60 sm:w-auto" type="submit">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check</span>
                {isSubmitting ? "Saving…" : "Save creator profile"}
              </button>
            </div>
          </Form>}
      </section> : null}
      </div>
    </WorkspaceShell>
  );
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
    user: "Client",
  };

  return labels[role] ?? role.replace(/[_-]/g, " ");
}
