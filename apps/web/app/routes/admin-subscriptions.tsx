import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useActionData, useLoaderData } from "react-router";
import { customerSubscriptions } from "@edicut/db/schema";
import { count as drizzleCount, isNull, sql } from "drizzle-orm";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { SubscriptionList, SubscriptionPagination } from "../components/SubscriptionList";
import { getDbFromContext } from "../lib/db.server";
import { isAdminRole, requireAdminUser } from "../lib/session.server";
import { toPublicAdminUser } from "../lib/admin-public";
import { isSameSiteMutation, listAdminSubscriptions, markSubscriptionPaid, readSubscriptionForm, subscriptionPage } from "../lib/customer-subscriptions.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";

export const meta: MetaFunction = () => [{ title: "Purchases | EdiCut Admin" }, { name: "robots", content: "noindex,nofollow" }];
export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }; }

async function adminAccess(request: Request, context: LoaderFunctionArgs["context"]) {
  const db = getDbFromContext(context);
  const admin = await requireAdminUser(request, db, context);
  if (!admin.active || !isAdminRole(admin.role)) throw new Response("Permission denied", { status: 403 });
  return { db, admin };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db, admin } = await adminAccess(request, context);
  const page = subscriptionPage(request);
  const [records, summaryRows] = await Promise.all([
    listAdminSubscriptions(db, page),
    db.select({
      total: drizzleCount(),
      paid: sql<number>`count(*) FILTER (WHERE ${customerSubscriptions.status} = 'paid')`.mapWith(Number),
      unpaid: sql<number>`count(*) FILTER (WHERE ${customerSubscriptions.status} = 'unpaid')`.mapWith(Number),
    }).from(customerSubscriptions).where(isNull(customerSubscriptions.deletedAt)),
  ]);
  return { admin: toPublicAdminUser(admin), records: records.slice(0, 25), summary: summaryRows[0] ?? { total: 0, paid: 0, unpaid: 0 }, page, hasNext: records.length > 25 };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return { error: "Please submit changes from this site." };
  if (requestBodyExceedsLimit(request, 4096)) return { error: "This request is too large." };
  const { db, admin } = await adminAccess(request, context);
  const limit = await consumeUsageLimit({ request, context, bindingName: "USER_ACTION_LIMITER", key: `admin:${admin.id}`, localLimit: 60, localPeriodSeconds: 60 });
  if (limit !== "allowed") return { error: "Please wait a minute and try again." };
  const form = await readSubscriptionForm(request, 4096);
  if (!form) return { error: "Submit a valid purchase record form under 4 KB." };
  if (form.get("intent") !== "mark-paid") return { error: "This purchase action is not available." };
  try {
    const updated = await markSubscriptionPaid(db, String(form.get("subscriptionId") || ""), admin.id, String(form.get("expectedUpdatedAt") || ""));
    return updated ? { success: "Payment recorded for this purchase." } : { error: "This purchase changed, was already paid/removed, or its coupon is no longer available. Refresh and check its status." };
  } catch {
    console.error("Unable to record subscription payment");
    return { error: "Payment could not be recorded. Refresh and try again." };
  }
}

export default function AdminSubscriptionsRoute() {
  const { admin, records, summary, page, hasNext } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <AdminPanelShell title="Purchases" activeTab="subscriptions" account={{ name: admin.name || admin.email, detail: admin.email }}>
    <h2 className="text-2xl font-black">Purchases</h2>
    <p className="mb-6 mt-2 max-w-xl text-sm text-slate-600">Review single-video edits and monthly editing packages. Confirm a payment only after funds are received; this records an offline payment and does not charge a card.</p>
    {result ? <p role={result.error ? "alert" : "status"} className={`mb-5 rounded-xl p-4 text-sm ${result.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{result.error || result.success}</p> : null}
    <SubscriptionList rows={records} admin summary={summary} />
    <SubscriptionPagination page={page} hasNext={hasNext} />
  </AdminPanelShell>;
}
