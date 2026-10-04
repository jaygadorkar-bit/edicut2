import type { LoaderFunctionArgs } from "react-router";
import { desc, isNotNull, isNull } from "drizzle-orm";
import { contactMessages } from "@edicut/db/schema";
import { getDbFromContext } from "../lib/db.server";
import { requireContactInboxAccess } from "../lib/contact-inbox-access.server";

const MAX_CSV_EXPORT_ROWS = 1_000;

// A resource route returns the CSV directly rather than rendering the inbox.
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db } = await requireContactInboxAccess(request, getDbFromContext(context), context);
  const requestedFilter = new URL(request.url).searchParams.get("filter");
  const filter = requestedFilter === "replied" || requestedFilter === "unreplied" ? requestedFilter : "all";
  const whereClause = filter === "replied" ? isNotNull(contactMessages.repliedAt) : filter === "unreplied" ? isNull(contactMessages.repliedAt) : undefined;
  const rows = await db.select().from(contactMessages).where(whereClause).orderBy(desc(contactMessages.createdAt)).limit(MAX_CSV_EXPORT_ROWS + 1);
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

  if (rows.length > MAX_CSV_EXPORT_ROWS) {
    return new Response(`CSV exports are limited to the newest ${MAX_CSV_EXPORT_ROWS} messages. Apply a narrower filter and export again.`, {
      status: 413,
      headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(toCsv(rows), {
    headers: {
      ...headers,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="edicut-customer-support-${filter}.csv"`,
    },
  });
}

function toCsv(rows: Array<typeof contactMessages.$inferSelect>) {
  const columns = ["id", "name", "email", "projectType", "monthlyVolume", "message", "status", "lastReply", "repliedAt", "createdAt", "updatedAt"] as const;
  return [columns.join(","), ...rows.map(row => columns.map(column => {
    const value = row[column];
    const text = String(value instanceof Date ? value.toISOString() : value ?? "");
    // Contact form values must remain text when opened in spreadsheet software.
    const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${safeText.replace(/"/g, '""')}"`;
  }).join(","))].join("\r\n");
}
