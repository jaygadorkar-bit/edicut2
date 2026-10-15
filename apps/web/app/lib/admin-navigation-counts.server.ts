import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import { contactMessages, customerSubscriptions } from "@edicut/db/schema";

/** Outstanding manual confirmations and enquiries that have not been read or replied to. */
export async function getAdminNavigationCounts(db: DatabaseClient) {
  const result = await db.execute(sql`SELECT
    (SELECT count(*) FROM ${customerSubscriptions} WHERE ${customerSubscriptions.deletedAt} IS NULL AND ${customerSubscriptions.status} = 'unpaid') AS "pendingOrderCount",
    (SELECT count(*) FROM ${contactMessages} WHERE ${contactMessages.repliedAt} IS NULL AND ${contactMessages.status} <> 'read') AS "unreadEnquiryCount"`);
  const rows = (Array.isArray(result) ? result : result.rows) as Array<{ pendingOrderCount: number | string; unreadEnquiryCount: number | string }>;
  return {
    pendingOrderCount: Number(rows[0]?.pendingOrderCount ?? 0),
    unreadEnquiryCount: Number(rows[0]?.unreadEnquiryCount ?? 0),
  };
}
