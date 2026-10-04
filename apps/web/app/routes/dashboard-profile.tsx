import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { eq } from "drizzle-orm";
import { users } from "@edicut/db/schema";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";
import { WorkspaceShell, Avatar } from "../components/WorkspaceShell";
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

const userNavItems = [
  { label: "Dashboard", icon: "dashboard_customize", path: "/dashboard", feature: "overview" as DashboardFeature },
  { label: "Projects", icon: "video_library", path: "/dashboard/projects", feature: "projects" as DashboardFeature },
  { label: "Reviews", icon: "rate_review", path: "/dashboard/reviews", feature: "reviews" as DashboardFeature },
  { label: "Uploads", icon: "upload_file", path: "/dashboard/uploads", feature: "uploads" as DashboardFeature },
  { label: "Purchases", icon: "receipt_long", path: "/dashboard/subscriptions", feature: "billing" as DashboardFeature },
  { label: "Affiliates", icon: "hub", path: "/dashboard/affiliates", feature: "affiliates" as DashboardFeature },
  { label: "Settings", icon: "settings", path: "/dashboard/settings", feature: "settings" as DashboardFeature },
];

export const meta: MetaFunction = () => [
  { title: "Profile settings - EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];

function readText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);

  if (!user) {
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
  return { user, allowedFeatures };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (requestBodyExceedsLimit(request, 64 * 1024)) {
    return { error: "This profile request is too large." };
  }

  const formData = await request.formData();
  const intent = readText(formData, "intent");

  if (intent === "logout") {
    const session = await getSession(request.headers.get("Cookie"), context);
    return redirect("/signin?redirectTo=/dashboard", {
      headers: { "Set-Cookie": await destroySession(session, context) },
    });
  }

  if (intent !== "save-profile") return { error: "Choose a profile action." };

  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);
  if (!user) throw redirect("/signin?redirectTo=/dashboard/profile");

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
    return {
      error: actionLimit === "limited"
        ? "You have submitted several requests. Wait a minute and try again."
        : "Usage protection is temporarily unavailable. Please try again shortly.",
    };
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
  const { user, allowedFeatures } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const displayName = user.name || user.email;
  const visibleNavItems = userNavItems.filter((item) => allowedFeatures.includes(item.feature));

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
      settingsTo="/dashboard/settings"
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
      <section className="neo-workspace__panel mx-auto max-w-3xl rounded-[26px] p-5 sm:p-7" aria-labelledby="profile-settings-title">
        <div className="flex items-center gap-4 border-b border-white/70 pb-5 sm:pb-6">
          <Avatar name={displayName} imageUrl={user.profileImageUrl} />
          <div className="min-w-0">
            <p className="neo-workspace__eyebrow">Account</p>
            <h2 id="profile-settings-title" className="neo-workspace__module-title mt-1 truncate">Profile settings</h2>
            <p className="neo-workspace__module-copy mt-1 truncate">Manage the details connected to your workspace.</p>
          </div>
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
