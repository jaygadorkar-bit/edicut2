import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { redirect, useLoaderData } from "react-router";
import { and, count as drizzleCount, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { configureGmailRuntimeEnv, sendMailViaGmail } from "@edicut/platform-core/lib/gmail";
import { contactMessages } from "@edicut/db/schema";
import { getDbFromContext } from "../lib/db.server";
import { requireContactInboxAccess } from "../lib/contact-inbox-access.server";
import { isSameSiteMutation } from "../lib/customer-subscriptions.server";
import { EnquiriesInbox } from "../components/EnquiriesInbox";
import type { LoaderContext } from "../types";
import { getPageWithinRange, getPositivePage } from "../lib/admin-data-requirements";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";

const PAGE_SIZE = 10;
const MAX_IMPORT_BYTES = 1024 * 1024;
const MAX_IMPORT_ROWS = 250;
const MAX_IMPORT_COLUMNS = 32;
const MAX_BULK_MESSAGE_IDS = 100;

type MessageFilter = "all" | "replied" | "unreplied";

export const meta: MetaFunction = () => [{ title: "Enquiries | EdiCut" }, { name: "robots", content: "noindex,nofollow" }];
export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }; }

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { user, db, allowedFeatures } = await requireDashboardUser(request, context);
  const url = new URL(request.url);
  const filter = getFilter(url.searchParams.get("filter"));
  const requestedPage = getPositivePage(url.searchParams.get("page"));
  const whereClause = getFilterClause(filter);

  if (url.searchParams.get("export") === "csv") {
    return redirect(`/dashboard/messages/export?filter=${filter}`, { headers: { "Cache-Control": "no-store" } });
  }

  const [totalResult, repliedResult, unrepliedResult, unreadResult] = await Promise.all([
    db.select({ count: drizzleCount() }).from(contactMessages).where(whereClause),
    db.select({ count: drizzleCount() }).from(contactMessages).where(isNotNull(contactMessages.repliedAt)),
    db.select({ count: drizzleCount() }).from(contactMessages).where(isNull(contactMessages.repliedAt)),
    db.select({ count: drizzleCount() }).from(contactMessages).where(and(isNull(contactMessages.repliedAt), ne(contactMessages.status, "read"))),
  ]);

  const total = Number(totalResult[0]?.count || 0);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const page = getPageWithinRange(requestedPage, totalPages);
  const messages = await db.select().from(contactMessages).where(whereClause)
    .orderBy(desc(contactMessages.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);

  return {
    user,
    allowedFeatures,
    messages,
    filter,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    repliedCount: Number(repliedResult[0]?.count || 0),
    unrepliedCount: Number(unrepliedResult[0]?.count || 0),
    unreadCount: Number(unreadResult[0]?.count || 0),
    flash: url.searchParams.get("flash") || "",
    error: url.searchParams.get("error") || "",
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  if (requestBodyExceedsLimit(request, MAX_IMPORT_BYTES)) {
    return redirect(withFlash("/dashboard/messages", "error", "The request is too large. Imports are limited to 1 MB."));
  }

  const { db, user } = await requireDashboardUser(request, context);
  const actionLimit = await consumeUsageLimit({
    context,
    request,
    bindingName: "USER_ACTION_LIMITER",
    key: `user:${user.id}`,
    localLimit: 60,
    localPeriodSeconds: 60,
  });
  if (actionLimit !== "allowed") {
    return redirect(withFlash(
      "/dashboard/messages",
      "error",
      actionLimit === "limited"
        ? "You have submitted several requests. Wait a minute and try again."
        : "Usage protection is temporarily unavailable. Please try again shortly.",
    ));
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const returnTo = safeReturnTo(String(formData.get("returnTo") || "/dashboard/messages"));

  if (intent === "mark-read") {
    const ids = Array.from(new Set(formData.getAll("messageIds").map(String).filter(id => /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id))));
    if (!ids.length || ids.length > PAGE_SIZE) return { ok: false };
    const viewedAt = new Date();
    await db.update(contactMessages).set({ status: "read", updatedAt: viewedAt })
      .where(and(inArray(contactMessages.id, ids), isNull(contactMessages.repliedAt), ne(contactMessages.status, "read")));
    return { ok: true };
  }

  if (intent === "reply") {
    const messageId = String(formData.get("messageId") || "");
    const subject = String(formData.get("subject") || "").trim();
    const reply = String(formData.get("reply") || "").trim();

    if (!messageId || !subject || subject.length > 160 || reply.length < 2 || reply.length > 10_000) {
      return redirect(withFlash(returnTo, "error", "Reply subject and message are required."));
    }

    const emailLimit = await consumeUsageLimit({
      context,
      request,
      bindingName: "EMAIL_SEND_LIMITER",
      key: `staff:${user.id}`,
      localLimit: 2,
      localPeriodSeconds: 60,
    });
    if (emailLimit !== "allowed") {
      return redirect(withFlash(
        returnTo,
        "error",
        emailLimit === "limited"
          ? "Email replies are limited to two per minute. Wait a minute and try again."
          : "Email usage protection is temporarily unavailable. Please try again shortly.",
      ));
    }

    const [message] = await db.select().from(contactMessages).where(eq(contactMessages.id, messageId)).limit(1);
    if (!message) {
      return redirect(withFlash(returnTo, "error", "Message not found."));
    }

    try {
      configureGmailRuntimeEnv(getEnvFromContext(context));
      await sendMailViaGmail({
        to: message.email,
        subject,
        html: replyEmailHtml(message.name, reply),
      });
    } catch (error) {
      console.error("Dashboard message reply email error:", error);
      const detail = error instanceof Error ? error.message : "Failed to send reply email.";
      return redirect(withFlash(returnTo, "error", detail));
    }

    const repliedAt = new Date();
    await db
      .update(contactMessages)
      .set({
        status: "replied",
        lastReply: reply,
        repliedAt,
        updatedAt: repliedAt,
      })
      .where(eq(contactMessages.id, messageId));

    return redirect(withFlash(returnTo, "flash", `Reply sent to ${message.email}.`));
  }

  if (intent === "bulk-delete") {
    const ids = Array.from(new Set(formData.getAll("messageIds").map(String).filter(Boolean)));
    if (!ids.length) {
      return redirect(withFlash(returnTo, "error", "Select at least one message to delete."));
    }
    if (ids.length > MAX_BULK_MESSAGE_IDS) {
      return redirect(withFlash(returnTo, "error", `Delete at most ${MAX_BULK_MESSAGE_IDS} messages at a time.`));
    }

    await db.delete(contactMessages).where(inArray(contactMessages.id, ids));
    return redirect(withFlash(returnTo, "flash", `Deleted ${ids.length} message${ids.length === 1 ? "" : "s"}.`));
  }

  if (intent === "import") {
    const csvText = await getImportCsvText(formData);
    if (csvText === null) {
      return redirect(withFlash(returnTo, "error", "Imports are limited to 1 MB."));
    }
    const rows = parseCsv(csvText);
    if (rows === null) {
      return redirect(withFlash(returnTo, "error", `Imports are limited to ${MAX_IMPORT_ROWS} rows per upload.`));
    }
    const imported = rows
      .map(rowToMessageInsert)
      .filter((row): row is NonNullable<ReturnType<typeof rowToMessageInsert>> => Boolean(row));

    if (!imported.length) {
      return redirect(withFlash(returnTo, "error", "No valid messages found in the import."));
    }

    await db.insert(contactMessages).values(imported);
    return redirect(withFlash(returnTo, "flash", `Imported ${imported.length} message${imported.length === 1 ? "" : "s"}.`));
  }

  return redirect(withFlash(returnTo, "error", "Unknown messages action."));
}

export default function DashboardMessagesRoute() {
  return <EnquiriesInbox data={useLoaderData<typeof loader>()} />;
}

async function requireDashboardUser(request: Request, context: LoaderContext) {
  const db = getDbFromContext(context);
  return requireContactInboxAccess(request, db, context);
}

function getFilter(value: string | null): MessageFilter {
  return value === "replied" || value === "unreplied" ? value : "all";
}

function getFilterClause(filter: MessageFilter) {
  if (filter === "replied") return isNotNull(contactMessages.repliedAt);
  if (filter === "unreplied") return isNull(contactMessages.repliedAt);
  return undefined;
}

function getEnvFromContext(context: any) {
  const viteEnv = import.meta.env as Record<string, string | undefined>;
  const nodeEnv = globalThis.process?.env as Record<string, string | undefined> | undefined;
  return {
    ...context?.cf?.env,
    ...context?.cloudflare?.env,
    ...viteEnv,
    ...nodeEnv,
  };
}

function replyEmailHtml(name: string, reply: string) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return [
    `<p style="font-size:15px;line-height:1.6;margin:0 0 16px;">${greeting}</p>`,
    `<div style="font-size:15px;line-height:1.7;white-space:pre-wrap;">${escapeHtml(reply)}</div>`,
    `<p style="font-size:13px;line-height:1.6;margin-top:24px;color:#6b7280;">EdiCut Team</p>`,
  ].join("");
}

function safeReturnTo(value: string) {
  return value.startsWith("/dashboard/messages") ? value : "/dashboard/messages";
}

function withFlash(path: string, key: "flash" | "error", value: string) {
  const url = new URL(path, "https://edicut.local");
  url.searchParams.delete("flash");
  url.searchParams.delete("error");
  url.searchParams.set(key, value);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

async function getImportCsvText(formData: FormData) {
  const file = formData.get("importFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMPORT_BYTES) return null;
    return file.text();
  }

  const text = String(formData.get("importCsv") || "");
  return new TextEncoder().encode(text).byteLength <= MAX_IMPORT_BYTES ? text : null;
}

function rowToMessageInsert(row: Record<string, string>) {
  const name = (row.name || "").trim();
  const email = (row.email || "").trim().toLowerCase();
  const message = (row.message || row.brief || "").trim();

  if (
    !name || name.length > 120 ||
    !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !message || message.length > 4_000 ||
    (row.projectType || row.project_type || "").length > 120 ||
    (row.monthlyVolume || row.monthly_volume || "").length > 120 ||
    (row.lastReply || row.last_reply || "").length > 10_000
  ) {
    return null;
  }

  const repliedAt = row.repliedAt ? new Date(row.repliedAt) : null;
  return {
    name,
    email,
    projectType: row.projectType || row.project_type || null,
    monthlyVolume: row.monthlyVolume || row.monthly_volume || null,
    message,
    status: repliedAt ? "replied" : row.status || "new",
    lastReply: row.lastReply || row.last_reply || null,
    repliedAt,
    createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : new Date(),
  };
}

function parseCsv(input: string): Array<Record<string, string>> | null {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(current);
      if (row.length > MAX_IMPORT_COLUMNS) return null;
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.length > MAX_IMPORT_COLUMNS) return null;
      if (row.some((cell) => cell.trim())) {
        rows.push(row);
        if (rows.length > MAX_IMPORT_ROWS + 1) return null;
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.length > MAX_IMPORT_COLUMNS) return null;
  if (row.some((cell) => cell.trim())) {
    rows.push(row);
    if (rows.length > MAX_IMPORT_ROWS + 1) return null;
  }

  const [headers, ...body] = rows;
  if (!headers) return [];

  return body.map((cells) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header.trim()] = (cells[index] || "").trim();
      return record;
    }, {}),
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
