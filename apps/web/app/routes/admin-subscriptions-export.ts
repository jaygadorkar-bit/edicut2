import type { LoaderFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { isAdminRole, requireAdminUser } from "../lib/session.server";
import { adminSubscriptionsCsv, listAdminSubscriptionsForExport } from "../lib/customer-subscriptions.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const admin = await requireAdminUser(request, db, context);
  if (!admin.active || !isAdminRole(admin.role)) throw new Response("Permission denied", { status: 403 });

  const requestedStatus = new URL(request.url).searchParams.get("status");
  const status = requestedStatus === "paid" || requestedStatus === "unpaid" ? requestedStatus : "all";
  const records = await listAdminSubscriptionsForExport(db, status);
  return new Response(adminSubscriptionsCsv(records), {
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${status === "all" ? "purchases" : `purchases-${status}`}.csv"`,
    },
  });
}
