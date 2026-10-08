import { and, count, eq, isNull, ne } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import { contactMessages, customerSubscriptions } from "@edicut/db/schema";

/** Outstanding manual confirmations and enquiries that have not been read or replied to. */
export async function getAdminNavigationCounts(db: DatabaseClient) {
  const [orders, enquiries] = await Promise.all([
    db.select({ count: count() }).from(customerSubscriptions)
      .where(and(isNull(customerSubscriptions.deletedAt), eq(customerSubscriptions.status, "unpaid"))),
    db.select({ count: count() }).from(contactMessages)
      .where(and(isNull(contactMessages.repliedAt), ne(contactMessages.status, "read"))),
  ]);
  return {
    pendingOrderCount: Number(orders[0]?.count ?? 0),
    unreadEnquiryCount: Number(enquiries[0]?.count ?? 0),
  };
}
