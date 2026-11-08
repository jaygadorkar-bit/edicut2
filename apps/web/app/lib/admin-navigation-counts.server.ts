import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import { contactMessages, customerSubscriptions } from "@edicut/db/schema";
import { VIDEO_EDITOR_PARTNER_APPLICATION_TYPE } from "./contact-message-filters.server";

/** Outstanding manual confirmations and enquiries that have not been read or replied to. */
export async function getAdminNavigationCounts(db: DatabaseClient) {
  const result = await db.execute(sql`SELECT
    (SELECT count(*) FROM ${customerSubscriptions} WHERE ${customerSubscriptions.deletedAt} IS NULL AND ${customerSubscriptions.status} = 'unpaid') AS "pendingOrderCount",
    (SELECT count(*) FROM ${contactMessages} WHERE ${contactMessages.repliedAt} IS NULL AND ${contactMessages.status} <> 'read' AND (${contactMessages.projectType} IS NULL OR ${contactMessages.projectType} <> ${VIDEO_EDITOR_PARTNER_APPLICATION_TYPE})) AS "unreadEnquiryCount"`);
  const rows = result as unknown as Array<{ pendingOrderCount: number | string; unreadEnquiryCount: number | string }>;
  return {
    pendingOrderCount: Number(rows[0]?.pendingOrderCount ?? 0),
    unreadEnquiryCount: Number(rows[0]?.unreadEnquiryCount ?? 0),
  };
}
