import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import { findUserById } from "@edicut/db/repositories/users";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { SubscriptionList, SubscriptionPagination } from "../components/SubscriptionList";
import { getDbFromContext } from "../lib/db.server";
import { requireUserId } from "../lib/session.server";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import { getAllowedDashboardFeatures, getDashboardLandingPath, type DashboardFeature } from "../lib/role-feature-access";
import { deleteUnpaidSubscription, isMissingCustomerSubscriptionSchema, isSameSiteMutation, listCustomerSubscriptions, readSubscriptionForm, subscriptionPage } from "../lib/customer-subscriptions.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";

export const meta: MetaFunction = () => [{ title: "Subscriptions | EdiCut" }, { name: "robots", content: "noindex,nofollow" }];
export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }; }

async function customerAccess(request: Request, context: LoaderFunctionArgs["context"]) {
  const id = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, id);
  if (!user?.active || user.deletedAt) throw redirect("/signin?redirectTo=/dashboard/subscriptions");
  const features = getAllowedDashboardFeatures(user.role, await getRoleFeatureAccessSettings(db, context));
  if (!features.includes("billing")) throw redirect(getDashboardLandingPath(features));
  return { db, user, features };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db, user, features } = await customerAccess(request, context);
  const page = subscriptionPage(request);
  let records: Awaited<ReturnType<typeof listCustomerSubscriptions>> = [];
  let purchaseHistoryAvailable = true;
  try {
    records = await listCustomerSubscriptions(db, user.id, page);
  } catch (error) {
    if (!isMissingCustomerSubscriptionSchema(error)) throw error;
    purchaseHistoryAvailable = false;
  }
  return { user: { name: user.name, email: user.email, profileImageUrl: user.profileImageUrl }, features, records: records.slice(0, 25), page, hasNext: records.length > 25, purchaseHistoryAvailable };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return { error: "Please submit changes from this site." };
  if (requestBodyExceedsLimit(request, 4096)) return { error: "This request is too large." };
  const { db, user } = await customerAccess(request, context);
  const limit = await consumeUsageLimit({ request, context, bindingName: "USER_ACTION_LIMITER", key: `user:${user.id}`, localLimit: 60, localPeriodSeconds: 60 });
  if (limit !== "allowed") return { error: "Please wait a minute and try again." };
  const form = await readSubscriptionForm(request, 4096);
  if (!form) return { error: "Submit a valid purchase form under 4 KB." };
  if (form.get("intent") !== "delete-unpaid") return { error: "This purchase action is not available." };
  try {
    const removed = await deleteUnpaidSubscription(db, user.id, String(form.get("subscriptionId") || ""));
    return removed ? { success: "Unpaid package selection removed." } : { error: "This unpaid package selection is no longer available. Paid subscriptions cannot be deleted." };
  } catch {
    console.error("Unable to delete unpaid subscription");
    return { error: "Your unpaid package selection could not be removed. Please try again." };
  }
}

const nav = [
  ["Dashboard", "dashboard_customize", "/dashboard", "overview"],
  ["Projects", "video_library", "/dashboard/projects", "projects"],
  ["Reviews", "rate_review", "/dashboard/reviews", "reviews"],
  ["Uploads", "upload_file", "/dashboard/uploads", "uploads"],
  ["Enquiries", "mail", "/dashboard/messages", "support"],
  ["Subscriptions", "receipt_long", "/dashboard/subscriptions", "billing"],
  ["Affiliates", "hub", "/dashboard/affiliates", "affiliates"],
];

export default function SubscriptionsRoute() {
  const { user, features, records, page, hasNext, purchaseHistoryAvailable } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <WorkspaceShell title="Subscriptions" navItems={nav.filter(item => features.includes(item[3] as DashboardFeature)).map(([label, icon, to]) => ({ label, icon, to, end: to === "/dashboard" }))}
    account={{ name: user.name || user.email, detail: user.email, imageUrl: user.profileImageUrl }} mobileMenu navigationFeedback hideHeaderTitle profileTo={features.includes("settings") ? "/dashboard/profile" : null} profileNavAtBottom settingsTo={features.includes("settings") ? "/dashboard/settings" : null} startProjectTo={features.includes("projects") ? "/dashboard/projects#new-project" : null} notificationsTo={features.includes("reviews") ? "/dashboard/reviews" : null}
    accountAction={<Form method="post" action="/signout"><button type="submit" aria-label="Sign out" className="min-h-11 px-2 text-slate-600"><span className="material-symbols-outlined" aria-hidden="true">logout</span></button></Form>}>
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-2xl font-black">Subscriptions</h2><p className="mt-2 max-w-xl text-sm text-slate-600">Review your subscriptions and package selections, including their payment status. Unpaid selections stay here until you pay or remove them.</p></div>
      <Link to="/pricing" className="inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">Choose a package</Link>
    </div>
    {result ? <p role={result.error ? "alert" : "status"} className={`mb-5 rounded-xl p-4 text-sm ${result.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{result.error || result.success}</p> : null}
    {purchaseHistoryAvailable ? <>
      {records.some(record => record.status === "paid") && features.includes("projects") ? <Link to="/dashboard/projects" className="neo-workspace__panel mb-5 flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-2xl p-4 text-sm font-bold">Your paid package is ready. Complete your channel profile and start a project.<span aria-hidden="true">→</span></Link> : null}
      <SubscriptionList rows={records.map(subscription => ({ subscription }))} />
      <SubscriptionPagination page={page} hasNext={hasNext} />
    </> : <div className="neo-workspace__panel rounded-2xl p-5" role="status">
      <h3 className="font-bold">Purchase history is temporarily unavailable</h3>
      <p className="mt-2 text-sm text-slate-600">Your subscription records have not been changed. Please try again later or <Link to="/contact" className="underline underline-offset-4">contact us for help</Link>.</p>
    </div>}
  </WorkspaceShell>;
}
