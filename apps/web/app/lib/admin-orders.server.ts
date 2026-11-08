import type { DatabaseClient } from "@edicut/db/client";
import { customerSubscriptions } from "@edicut/db/schema";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getPageWithinRange } from "./admin-data-requirements";
import {
  deleteAdminSubscription,
  listAdminSubscriptions,
  markSubscriptionPaid,
  markSubscriptionUnpaid,
} from "./customer-subscriptions.server";
import { isWorkspaceRecordId } from "./workspace";
import { isAdminRole } from "./session.server";
import { notifyChatAccessChange } from "./chat-realtime.server";
import type { LoaderFunctionArgs } from "react-router";

export const ADMIN_ORDER_PAGE_SIZE = 25;
export async function loadAdminOrders(
  db: DatabaseClient,
  request: Request,
  ownerId?: string,
) {
  const params = new URL(request.url).searchParams;
  const eventId = params.get("event") || undefined;
  if (
    (eventId && !isWorkspaceRecordId(eventId)) ||
    (ownerId && !isWorkspaceRecordId(ownerId))
  )
    throw new Response("Order not found.", { status: 404 });
  const status =
    params.get("status") === "paid"
      ? "paid"
      : params.get("status") === "unpaid"
        ? "unpaid"
        : "all";
  const [summary = { total: 0, paid: 0, unpaid: 0 }] = await db
    .select({
      total: count(),
      paid: sql<number>`count(*) FILTER (WHERE ${customerSubscriptions.status} = 'paid')`.mapWith(
        Number,
      ),
      unpaid:
        sql<number>`count(*) FILTER (WHERE ${customerSubscriptions.status} = 'unpaid')`.mapWith(
          Number,
        ),
    })
    .from(customerSubscriptions)
    .where(
      and(
        isNull(customerSubscriptions.deletedAt),
        ownerId ? eq(customerSubscriptions.ownerId, ownerId) : undefined,
      ),
    );
  const total =
    status === "paid"
      ? summary.paid
      : status === "unpaid"
        ? summary.unpaid
        : summary.total;
  const requestedPage = Math.min(
    100_000,
    Math.max(
      1,
      Number.parseInt(params.get(ownerId ? "orderPage" : "page") || "1", 10) ||
        1,
    ),
  );
  const page = eventId
    ? 1
    : getPageWithinRange(
        requestedPage,
        Math.ceil(total / ADMIN_ORDER_PAGE_SIZE),
      );
  const records = await listAdminSubscriptions(
    db,
    page,
    status,
    eventId,
    ownerId,
  );
  return {
    records: records.slice(0, ADMIN_ORDER_PAGE_SIZE),
    summary,
    page,
    status,
    eventId: eventId ?? null,
    ownerId: ownerId ?? null,
    hasNext: !eventId && records.length > ADMIN_ORDER_PAGE_SIZE,
  };
}

export async function mutateAdminOrder(
  db: DatabaseClient,
  context: LoaderFunctionArgs["context"],
  admin: { id: string; role: string; active: boolean },
  form: FormData,
) {
  if (!admin.active || !isAdminRole(admin.role))
    throw new Response("Permission denied", { status: 403 });
  const intent = String(form.get("intent") || ""),
    subscriptionId = String(form.get("subscriptionId") || ""),
    expectedUpdatedAt = String(form.get("expectedUpdatedAt") || "");
  try {
    let updated: boolean, success: string, error: string;
    if (intent === "mark-paid") {
      updated = await markSubscriptionPaid(
        db,
        subscriptionId,
        admin.id,
        expectedUpdatedAt,
      );
      success = "Payment recorded for this order.";
      error =
        "This order changed, was already paid or removed, or its coupon is no longer available. Refresh and check its status.";
    } else if (intent === "mark-unpaid") {
      updated = await markSubscriptionUnpaid(
        db,
        subscriptionId,
        expectedUpdatedAt,
      );
      success = "Order marked unpaid. Paid access has been removed.";
      error =
        "This order changed or has already been used for project work. Refresh and review its activity before changing payment status.";
    } else if (intent === "delete-purchase") {
      updated = await deleteAdminSubscription(
        db,
        subscriptionId,
        expectedUpdatedAt,
      );
      success = "Order removed from the ledger.";
      error =
        "This order changed or has already been used for project work. Refresh and review its activity before deleting it.";
    } else return { error: "This order action is not available." };
    if (!updated) return { error };
    try {
      await notifyChatAccessChange(db, context, { subscriptionId });
    } catch {
      return {
        success,
        warning:
          "The order is saved. Live access notifications could not be delivered; refresh the affected workspace.",
      };
    }
    return { success };
  } catch {
    console.error("Unable to update admin order");
    return { error: "This order could not be updated. Refresh and try again." };
  }
}
