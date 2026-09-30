import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useLoaderData } from "react-router";
import { findUserById } from "@edicut/db/repositories/users";
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

const sectionConfigs = {
  projects: {
    label: "Projects",
    icon: "video_library",
    feature: "projects" as DashboardFeature,
    title: "Projects workspace",
    description: "A focused home for briefs, project status, editor assignments, and final deliverables.",
    items: [
      ["Create a project brief", "Capture the channel, format, references, and delivery expectations in one place."],
      ["Track production status", "See what is in intake, editing, review, revision, and delivery."],
      ["Manage project files", "Keep raw footage, notes, exports, and approvals connected to each project."],
    ],
  },
  reviews: {
    label: "Reviews",
    icon: "rate_review",
    feature: "reviews" as DashboardFeature,
    title: "Review center",
    description: "A review queue for timestamped notes, approvals, and revision requests.",
    items: [
      ["Pending approvals", "Collect feedback on the latest cuts before they move to delivery."],
      ["Timestamped notes", "Keep every requested change attached to the exact moment in the video."],
      ["Revision history", "Compare previous submissions and keep a clear record of decisions."],
    ],
  },
  uploads: {
    label: "Uploads",
    icon: "upload_file",
    feature: "uploads" as DashboardFeature,
    title: "Upload studio",
    description: "A safe place to send footage, references, brand assets, and supporting files.",
    items: [
      ["Upload a new batch", "Add footage and reference material to an existing or new project."],
      ["File checklist", "See which required files are still missing before editing begins."],
      ["Transfer history", "Review recent uploads and their processing status."],
    ],
  },
  billing: {
    label: "Billing",
    icon: "receipt_long",
    feature: "billing" as DashboardFeature,
    title: "Billing center",
    description: "A clear view of packages, invoices, receipts, and payment history.",
    items: [
      ["Current package", "Review the editing plan and deliverables connected to your workspace."],
      ["Invoices and receipts", "Keep payment records ready for download and account reconciliation."],
      ["Payment methods", "Manage the billing details used for future project work."],
    ],
  },
  affiliates: {
    label: "Affiliates",
    icon: "hub",
    feature: "affiliates" as DashboardFeature,
    title: "Affiliate hub",
    description: "A workspace for referral links, campaign performance, conversions, and payouts.",
    items: [
      ["Referral links", "Create and manage links for the channels and campaigns you promote."],
      ["Performance overview", "Track clicks, signups, paid clients, and conversion progress."],
      ["Payout history", "Review approved commissions and upcoming payout dates."],
    ],
  },
  settings: {
    label: "Settings",
    icon: "settings",
    feature: "settings" as DashboardFeature,
    title: "Workspace settings",
    description: "Manage profile details, notifications, security preferences, and workspace defaults.",
    items: [
      ["Profile and preferences", "Keep your contact details and workspace preferences up to date."],
      ["Notifications", "Choose which project, review, billing, and support updates you receive."],
      ["Security", "Review sign-in activity and account protection settings."],
    ],
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

export const meta: MetaFunction = () => [{ title: "Dashboard workspace - EdiCut" }];

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  if (formData.get("intent") !== "logout") return null;

  const session = await getSession(request.headers.get("Cookie"), context);
  return redirect("/signin?redirectTo=/dashboard", {
    headers: {
      "Set-Cookie": await destroySession(session, context),
    },
  });
}

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const section = params.section as PlaceholderSection | undefined;
  const config = section ? sectionConfigs[section] : undefined;

  if (!config) {
    throw redirect("/dashboard");
  }

  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);

  if (!user) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin?redirectTo=/dashboard", {
      headers: {
        "Set-Cookie": await destroySession(session, context),
      },
    });
  }

  const roleFeatureAccess = await getRoleFeatureAccessSettings(db);
  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);

  if (!canAccessDashboardFeature(user.role, config.feature, roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(allowedFeatures));
  }

  return { user, allowedFeatures, section, config };
}

export default function DashboardPlaceholderRoute() {
  const { user, allowedFeatures, config } = useLoaderData<typeof loader>();
  const displayName = user.name || user.email;
  const visibleNavItems = userNavItems.filter((item) => allowedFeatures.includes(item.feature));

  return (
    <WorkspaceShell
      title={config.title}
      subtitle={`${normalizeRole(user.role)} workspace`}
      navItems={visibleNavItems.map(({ label, icon, path }) => ({
        label,
        icon,
        to: path,
        end: path === "/dashboard",
      }))}
      account={{ name: displayName, detail: normalizeRole(user.role), imageUrl: user.profileImageUrl }}
      accountAction={(
        <Form method="post">
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" className="text-[#a0a3b5] transition hover:text-[#5a43d5]" aria-label="Sign out">
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </Form>
      )}
      headerActions={(
        <Link to="/dashboard" className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex">
          <span className="material-symbols-outlined text-[17px]">dashboard_customize</span>
          Dashboard
        </Link>
      )}
    >
      <section className="neo-workspace__panel rounded-[24px] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="neo-icon-badge neo-workspace__module-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
              <span className="material-symbols-outlined text-[24px]">{config.icon}</span>
            </span>
            <div>
              <p className="neo-workspace__eyebrow">Workspace module</p>
              <h2 className="neo-workspace__module-title mt-1">{config.label}</h2>
              <p className="neo-workspace__module-copy mt-2 max-w-2xl">{config.description}</p>
            </div>
          </div>
          <span className="neo-workspace__status inline-flex w-fit items-center gap-2 rounded-full px-3 py-2">
            <span className="neo-workspace__status-dot h-1.5 w-1.5 rounded-full" />
            Coming soon
          </span>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {config.items.map(([title, copy]) => (
            <article key={title} className="neo-workspace__subpanel rounded-2xl p-4">
              <span className="neo-workspace__accent-icon material-symbols-outlined text-[20px]">auto_awesome</span>
              <h3 className="neo-workspace__subpanel-title mt-4">{title}</h3>
              <p className="neo-workspace__subpanel-copy mt-2">{copy}</p>
            </article>
          ))}
        </div>

        <div className="neo-workspace__callout mt-8 flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="neo-workspace__callout-title text-sm">This workspace is being prepared.</p>
            <p className="neo-workspace__callout-copy mt-1 text-xs">The navigation and access control are ready while the full workflow is being connected.</p>
          </div>
          <Link to="/dashboard" className="neo-workspace__secondary-action inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-xs">
            <span className="material-symbols-outlined text-[17px]">arrow_back</span>
            Back to dashboard
          </Link>
        </div>
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
