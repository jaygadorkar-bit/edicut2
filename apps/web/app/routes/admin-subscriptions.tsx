import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useActionData, useLoaderData } from "react-router";
import { customerSubscriptions } from "@edicut/db/schema";
import { count as drizzleCount, isNull, sql } from "drizzle-orm";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { SubscriptionList, SubscriptionPagination } from "../components/SubscriptionList";
import { getDbFromContext } from "../lib/db.server";
import { isAdminRole, requireAdminUser } from "../lib/session.server";
import { toPublicAdminUser } from "../lib/admin-public";
import { deleteAdminSubscription, isSameSiteMutation, listAdminSubscriptions, markSubscriptionPaid, markSubscriptionUnpaid, readSubscriptionForm, subscriptionPage, subscriptionPaymentFilter } from "../lib/customer-subscriptions.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { getPageWithinRange } from "../lib/admin-data-requirements";

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
  const status = subscriptionPaymentFilter(request);
  const requestedPage = subscriptionPage(request);
  const [summaryRows, requestedRecords] = await Promise.all([
    db.select({
      total: drizzleCount(),
      paid: sql<number>`count(*) FILTER (WHERE ${customerSubscriptions.status} = 'paid')`.mapWith(Number),
      unpaid: sql<number>`count(*) FILTER (WHERE ${customerSubscriptions.status} = 'unpaid')`.mapWith(Number),
    }).from(customerSubscriptions).where(isNull(customerSubscriptions.deletedAt)),
    listAdminSubscriptions(db, requestedPage, status),
  ]);
  const summary = summaryRows[0] ?? { total: 0, paid: 0, unpaid: 0 };
  const statusTotal = status === "paid" ? summary.paid : summary.unpaid;
  const page = getPageWithinRange(requestedPage, Math.ceil(statusTotal / 25));
  const records = page === requestedPage ? requestedRecords : await listAdminSubscriptions(db, page, status);
  return { admin: toPublicAdminUser(admin), records: records.slice(0, 25), summary, page, status, hasNext: records.length > 25 };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return { error: "Please submit changes from this site." };
  if (requestBodyExceedsLimit(request, 4096)) return { error: "This request is too large." };
  const { db, admin } = await adminAccess(request, context);
  const limit = await consumeUsageLimit({ request, context, bindingName: "USER_ACTION_LIMITER", key: `admin:${admin.id}`, localLimit: 60, localPeriodSeconds: 60 });
  if (limit !== "allowed") return { error: "Please wait a minute and try again." };
  const form = await readSubscriptionForm(request, 4096);
  if (!form) return { error: "Submit a valid purchase record form under 4 KB." };
  const intent = String(form.get("intent") || "");
  const subscriptionId = String(form.get("subscriptionId") || "");
  const expectedUpdatedAt = String(form.get("expectedUpdatedAt") || "");
  try {
    if (intent === "mark-paid") {
      const updated = await markSubscriptionPaid(db, subscriptionId, admin.id, expectedUpdatedAt);
      return updated ? { success: "Payment recorded for this purchase." } : { error: "This purchase changed, was already paid or removed, or its coupon is no longer available. Refresh and check its status." };
    }
    if (intent === "mark-unpaid") {
      const updated = await markSubscriptionUnpaid(db, subscriptionId, expectedUpdatedAt);
      return updated ? { success: "Purchase marked unpaid. Paid access has been removed." } : { error: "This purchase changed or has already been used for project work. Refresh and review its activity before changing payment status." };
    }
    if (intent === "delete-purchase") {
      const deleted = await deleteAdminSubscription(db, subscriptionId, expectedUpdatedAt);
      return deleted ? { success: "Purchase removed from the ledger." } : { error: "This purchase changed or has already been used for project work. Refresh and review its activity before deleting it." };
    }
    return { error: "This purchase action is not available." };
  } catch {
    console.error("Unable to update admin purchase");
    return { error: "This purchase could not be updated. Refresh and try again." };
  }
}

export default function AdminSubscriptionsRoute() {
  const { admin, records, summary, page, status, hasNext } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <AdminPanelShell title="Purchases" activeTab="subscriptions" account={{ name: admin.name || admin.email, detail: admin.email }}>
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-2xl font-black">Purchases</h2>
      <a href="/site/node-logmin/subscriptions/export" download="purchases.csv" aria-label="Export all purchases as CSV" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
        <span aria-hidden="true" className="material-symbols-outlined text-base">download</span>Export all
      </a>
    </div>
    {result ? <p role={result.error ? "alert" : "status"} className={`mb-5 rounded-xl p-4 text-sm ${result.error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}>{result.error || result.success}</p> : null}
    <SubscriptionList rows={records} admin summary={summary} status={status} />
    <SubscriptionPagination page={page} hasNext={hasNext} status={status} />
  </AdminPanelShell>;
}
