import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, NavLink, redirect, useLoaderData, useNavigation, useSearchParams } from "react-router";
import { count as drizzleCount, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { configureGmailRuntimeEnv, sendMailViaGmail } from "@edicut/platform-core/lib/gmail";
import { contactMessages } from "@edicut/db/schema";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../lib/db.server";
import { destroySession, getSession, requireUserId } from "../lib/session.server";
import { getRoleFeatureAccessSettings } from "../lib/site-settings.server";
import {
  canAccessDashboardFeature,
  getAllowedDashboardFeatures,
  getDashboardLandingPath,
  type DashboardFeature,
} from "../lib/role-feature-access";

const PAGE_SIZE = 10;

const navItems = [
  { label: "Home", icon: "home", path: "/", feature: null },
  { label: "Overview", icon: "space_dashboard", path: "/dashboard", feature: "overview" as DashboardFeature },
  { label: "Projects", icon: "video_library", path: "/dashboard/projects", feature: "projects" as DashboardFeature },
  { label: "Reviews", icon: "rate_review", path: "/dashboard/reviews", feature: "reviews" as DashboardFeature },
  { label: "Uploads", icon: "upload_file", path: "/dashboard/uploads", feature: "uploads" as DashboardFeature },
  { label: "Contact Inbox", icon: "support_agent", path: "/dashboard/messages", feature: "support" as DashboardFeature },
  { label: "Billing", icon: "receipt_long", path: "/dashboard/billing", feature: "billing" as DashboardFeature },
  { label: "Affiliates", icon: "hub", path: "/dashboard/affiliates", feature: "affiliates" as DashboardFeature },
  { label: "Settings", icon: "settings", path: "/dashboard/settings", feature: "settings" as DashboardFeature },
];

type MessageFilter = "all" | "replied" | "unreplied";

export const meta: MetaFunction = () => [{ title: "Contact Inbox - EdiCut Dashboard" }];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { user, db, allowedFeatures } = await requireDashboardUser(request, context);
  const url = new URL(request.url);
  const filter = getFilter(url.searchParams.get("filter"));
  const page = Math.max(Number(url.searchParams.get("page") || "1"), 1);
  const whereClause = getFilterClause(filter);

  if (url.searchParams.get("export") === "csv") {
    const rows = await db.select().from(contactMessages).where(whereClause).orderBy(desc(contactMessages.createdAt));
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="edicut-customer-support-${filter}.csv"`,
      },
    });
  }

  const [messages, totalResult, repliedResult, unrepliedResult] = await Promise.all([
    db
      .select()
      .from(contactMessages)
      .where(whereClause)
      .orderBy(desc(contactMessages.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ count: drizzleCount() }).from(contactMessages).where(whereClause),
    db.select({ count: drizzleCount() }).from(contactMessages).where(isNotNull(contactMessages.repliedAt)),
    db.select({ count: drizzleCount() }).from(contactMessages).where(isNull(contactMessages.repliedAt)),
  ]);

  const total = Number(totalResult[0]?.count || 0);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return {
    user,
    allowedFeatures,
    messages,
    filter,
    page: Math.min(page, totalPages),
    pageSize: PAGE_SIZE,
    total,
    totalPages,
    repliedCount: Number(repliedResult[0]?.count || 0),
    unrepliedCount: Number(unrepliedResult[0]?.count || 0),
    flash: url.searchParams.get("flash") || "",
    error: url.searchParams.get("error") || "",
  };
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { db } = await requireDashboardUser(request, context);
  const formData = await request.formData();
  const intent = String(formData.get("intent") || "");
  const returnTo = safeReturnTo(String(formData.get("returnTo") || "/dashboard/messages"));

  if (intent === "reply") {
    const messageId = String(formData.get("messageId") || "");
    const subject = String(formData.get("subject") || "").trim();
    const reply = String(formData.get("reply") || "").trim();

    if (!messageId || !subject || reply.length < 2) {
      return redirect(withFlash(returnTo, "error", "Reply subject and message are required."));
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

    await db
      .update(contactMessages)
      .set({
        status: "replied",
        lastReply: reply,
        repliedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contactMessages.id, messageId));

    return redirect(withFlash(returnTo, "flash", `Reply sent to ${message.email}.`));
  }

  if (intent === "bulk-delete") {
    const ids = formData.getAll("messageIds").map(String).filter(Boolean);
    if (!ids.length) {
      return redirect(withFlash(returnTo, "error", "Select at least one message to delete."));
    }

    await db.delete(contactMessages).where(inArray(contactMessages.id, ids));
    return redirect(withFlash(returnTo, "flash", `Deleted ${ids.length} message${ids.length === 1 ? "" : "s"}.`));
  }

  if (intent === "import") {
    const csvText = await getImportCsvText(formData);
    const rows = parseCsv(csvText);
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
  const { user, allowedFeatures, messages, filter, page, total, totalPages, repliedCount, unrepliedCount, flash, error } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const displayName = user.name || user.email;
  const isSubmitting = navigation.state !== "idle";
  const currentPath = `/dashboard/messages?${searchParams.toString()}`;
  const exportPath = `/dashboard/messages?${withParam(searchParams, "export", "csv")}`;
  const visibleNavItems = navItems.filter((item) => !item.feature || allowedFeatures.includes(item.feature));

  return (
    <div className="min-h-screen bg-[#F6F7F8] font-sans text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-gray-200 bg-white lg:block">
        <div className="flex h-full flex-col p-4">
          <Link to="/" className="flex items-center gap-3 rounded-lg px-2 py-2 secondary">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white shadow-lg shadow-red-500/20">
              <span className="material-symbols-outlined text-[22px]">play_arrow</span>
            </span>
            <span>
              <span className="block text-lg font-black uppercase tracking-tight">EdiCut</span>
              <span className="block text-xs font-bold text-muted-foreground">Operations workspace</span>
            </span>
          </Link>

          <nav className="mt-8 grid gap-1">
            {visibleNavItems.map(({ label, icon, path }) => (
              <NavLink
                key={label}
                to={path}
                end={path === "/" || path === "/dashboard"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold transition-colors ${
                    isActive
                      ? "bg-foreground text-white shadow-md shadow-black/10"
                      : "text-[#575757] hover:bg-black/5 hover:text-foreground"
                  }`
                }
              >
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto rounded-lg border border-gray-200 bg-secondary p-4">
            <p className="text-xs font-black uppercase text-muted-foreground">Signed in as</p>
            <p className="mt-2 truncate text-sm font-black">{displayName}</p>
            <p className="mt-1 text-xs font-bold text-muted-foreground">{normalizeRole(user.role)}</p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">Dashboard</p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">Contact Inbox</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={exportPath} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-black">
                <span className="material-symbols-outlined text-[20px]">download</span>
                Export CSV
              </a>
              <Link to="/contact#contact" className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white shadow-lg shadow-red-500/15">
                <span className="material-symbols-outlined text-[20px]">open_in_new</span>
                Contact form
              </Link>
            </div>
          </div>
          <nav className="mx-auto mt-3 flex max-w-[1500px] gap-2 overflow-x-auto pb-1 lg:hidden">
            {visibleNavItems.slice(0, 6).map(({ label, icon, path }) => (
              <NavLink
                key={label}
                to={path}
                end={path === "/" || path === "/dashboard"}
                className={({ isActive }) =>
                  `inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition-colors ${
                    isActive
                      ? "bg-foreground text-white shadow-md shadow-black/10"
                      : "border border-gray-200 bg-white text-[#575757] hover:bg-black/5"
                  }`
                }
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>
        </header>

        <main className="mx-auto grid max-w-[1500px] gap-3 px-3 py-3 sm:px-5">
          {flash ? <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">{flash}</div> : null}
          {error ? <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-black text-red-600">{error}</div> : null}

          <section className="grid gap-2 md:grid-cols-3">
            <MetricCard label="Filtered tickets" value={total} icon="support_agent" />
            <MetricCard label="Unreplied" value={unrepliedCount} icon="mark_chat_unread" />
            <MetricCard label="Replied" value={repliedCount} icon="mark_chat_read" />
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h2 className="font-black">Support inbox</h2>
                <p className="mt-1 text-sm font-bold text-muted-foreground">Contact us submissions, replies, import, export, and bulk delete.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterLink label="All" value="all" active={filter === "all"} params={searchParams} />
                <FilterLink label="Unreplied" value="unreplied" active={filter === "unreplied"} params={searchParams} />
                <FilterLink label="Replied" value="replied" active={filter === "replied"} params={searchParams} />
              </div>
            </div>

            <Form method="post" encType="multipart/form-data" className="mt-3 grid gap-2 rounded-lg bg-secondary p-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <input type="hidden" name="intent" value="import" />
              <input type="hidden" name="returnTo" value={currentPath} />
              <label className="grid gap-2 text-sm font-black text-[#575757]">
                Import CSV
                <input name="importFile" type="file" accept=".csv,text/csv" className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-bold" />
              </label>
              <details className="lg:col-span-2">
                <summary className="cursor-pointer text-xs font-black uppercase text-muted-foreground">Paste CSV instead</summary>
                <textarea name="importCsv" rows={3} className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 text-sm font-medium outline-none focus:border-foreground" placeholder="name,email,projectType,monthlyVolume,message,status" />
              </details>
              <button type="submit" disabled={isSubmitting} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-black text-white disabled:opacity-50">
                <span className="material-symbols-outlined text-[20px]">upload_file</span>
                Import
              </button>
            </Form>
          </section>

          <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <Form id="bulk-delete-form" method="post">
              <input type="hidden" name="intent" value="bulk-delete" />
              <input type="hidden" name="returnTo" value={currentPath} />
            </Form>
            <div className="flex flex-col justify-between gap-2 border-b border-gray-100 p-3 sm:flex-row sm:items-center">
              <span className="inline-flex rounded-md bg-[#F1F1F1] px-2.5 py-1 text-xs font-black text-slate-800">
                Page {page} of {totalPages}
              </span>
              <button type="submit" form="bulk-delete-form" disabled={isSubmitting || messages.length === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 text-sm font-black text-red-600 disabled:opacity-50">
                <span className="material-symbols-outlined text-[20px]">delete</span>
                Delete selected
              </button>
            </div>

            {messages.length === 0 ? (
              <div className="grid min-h-80 place-items-center px-6 py-16 text-center">
                <div>
                  <span className="material-symbols-outlined text-[44px] text-muted-foreground">inbox</span>
                  <h3 className="mt-3 text-xl font-black">No messages found</h3>
                  <p className="mt-2 max-w-md text-sm font-medium leading-6 text-muted-foreground">
                    New Contact us submissions will appear here.
                  </p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {messages.map((message) => (
                  <article key={message.id} className="grid gap-3 p-3 xl:grid-cols-[24px_250px_minmax(0,1fr)_320px]">
                    <input form="bulk-delete-form" name="messageIds" value={message.id} type="checkbox" className="mt-2 h-4 w-4 accent-black" aria-label={`Select message from ${message.name}`} />
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF0F0] text-primary">
                          <span className="material-symbols-outlined text-[20px]">person</span>
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black">{message.name}</h3>
                          <a className="truncate text-xs font-bold text-muted-foreground hover:text-primary" href={`mailto:${message.email}`}>
                            {message.email}
                          </a>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <SourcePill label="Contact us" />
                        <InfoPill label={message.projectType || "Project type not set"} />
                        <InfoPill label={message.monthlyVolume || "Volume not set"} />
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <StatusPill status={message.repliedAt ? "replied" : "new"} />
                        <time className="text-xs font-bold text-muted-foreground">{formatDate(message.createdAt)}</time>
                      </div>
                    </div>

                    <div>
                      <p className="whitespace-pre-wrap text-sm font-medium leading-5 text-[#575757]">{message.message}</p>
                      {message.lastReply ? (
                        <div className="mt-2 rounded-lg bg-secondary p-2">
                          <p className="text-xs font-black uppercase text-muted-foreground">Last reply</p>
                          <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-5 text-[#575757]">{message.lastReply}</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-lg border border-gray-200 bg-secondary p-2">
                      <p className="text-xs font-black uppercase text-muted-foreground">Panel reply</p>
                      <ReplyForm messageId={message.id} recipientName={message.name} isSubmitting={isSubmitting} returnTo={currentPath} />
                    </div>
                  </article>
                ))}
              </div>
            )}

            <Pagination page={page} totalPages={totalPages} params={searchParams} />
          </section>
        </main>
      </div>
    </div>
  );
}

async function requireDashboardUser(request: Request, context: any) {
  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);
  const user = await findUserById(db, userId);

  if (!user) {
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/?auth=signin&redirectTo=/dashboard/messages", {
      headers: {
        "Set-Cookie": await destroySession(session, context),
      },
    });
  }

  const roleFeatureAccess = await getRoleFeatureAccessSettings(db);
  const allowedFeatures = getAllowedDashboardFeatures(user.role, roleFeatureAccess);

  if (!canAccessDashboardFeature(user.role, "support", roleFeatureAccess)) {
    throw redirect(getDashboardLandingPath(allowedFeatures));
  }

  return { user, db, allowedFeatures };
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

function normalizeRole(role: string) {
  const labels: Record<string, string> = {
    admin: "Administrator",
    manager: "Editor manager",
    project_manager: "Editor manager",
    editor: "Editor",
    customer_support: "Customer support",
    affiliate: "Affiliate marketer",
    client: "Client",
    user: "Client",
  };

  return labels[role] ?? role.replace(/[_-]/g, " ");
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
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

function withParam(params: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(params);
  next.set(key, value);
  next.delete("flash");
  next.delete("error");
  return next.toString();
}

function pageHref(params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  next.set("page", String(page));
  next.delete("flash");
  next.delete("error");
  next.delete("export");
  return `/dashboard/messages?${next.toString()}`;
}

function filterHref(params: URLSearchParams, filter: MessageFilter) {
  const next = new URLSearchParams(params);
  next.set("filter", filter);
  next.set("page", "1");
  next.delete("flash");
  next.delete("error");
  next.delete("export");
  return `/dashboard/messages?${next.toString()}`;
}

function MetricCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF0F0] text-primary">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
      </div>
    </article>
  );
}

function FilterLink({ label, value, active, params }: { label: string; value: MessageFilter; active: boolean; params: URLSearchParams }) {
  return (
    <Link
      to={filterHref(params, value)}
      className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-black ${active ? "bg-foreground text-white" : "border border-gray-200 bg-white text-[#575757]"}`}
    >
      {label}
    </Link>
  );
}

function ReplyForm({ messageId, recipientName, returnTo, isSubmitting }: { messageId: string; recipientName: string; returnTo: string; isSubmitting: boolean }) {
  return (
    <Form method="post" className="mt-2 grid gap-2">
      <input type="hidden" name="intent" value="reply" />
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input name="subject" required defaultValue="Re: Your EdiCut inquiry" className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-bold outline-none focus:border-foreground" />
      <textarea name="reply" required rows={3} className="rounded-lg border border-gray-200 bg-white p-2 text-sm font-medium leading-5 outline-none focus:border-foreground" placeholder={`Write a reply to ${recipientName}`} />
      <button type="submit" disabled={isSubmitting} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-black text-white disabled:opacity-50">
        <span className="material-symbols-outlined text-[20px]">send</span>
        Send reply
      </button>
    </Form>
  );
}

function Pagination({ page, totalPages, params }: { page: number; totalPages: number; params: URLSearchParams }) {
  return (
    <div className="flex flex-col justify-between gap-2 border-t border-gray-100 p-3 sm:flex-row sm:items-center">
      <p className="text-sm font-bold text-muted-foreground">Server-side pagination</p>
      <div className="flex items-center gap-2">
        <Link to={pageHref(params, Math.max(1, page - 1))} className={`inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-black ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}>
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
          Previous
        </Link>
        <span className="text-xs font-black text-muted-foreground">{page} / {totalPages}</span>
        <Link to={pageHref(params, Math.min(totalPages, page + 1))} className={`inline-flex h-9 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-black ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}>
          Next
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </Link>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-black ${status === "new" ? "bg-[#FFF0F0] text-primary" : "bg-[#F1F1F1] text-slate-800"}`}>
      {status}
    </span>
  );
}

function InfoPill({ label }: { label: string }) {
  return <span className="inline-flex rounded-md bg-[#F1F1F1] px-2.5 py-1 text-xs font-black text-slate-800">{label}</span>;
}

function SourcePill({ label }: { label: string }) {
  return <span className="inline-flex rounded-md bg-red-50 px-2.5 py-1 text-xs font-black text-primary">{label}</span>;
}

async function getImportCsvText(formData: FormData) {
  const file = formData.get("importFile");
  if (file instanceof File && file.size > 0) {
    return file.text();
  }

  return String(formData.get("importCsv") || "");
}

function rowToMessageInsert(row: Record<string, string>) {
  const name = (row.name || "").trim();
  const email = (row.email || "").trim().toLowerCase();
  const message = (row.message || row.brief || "").trim();

  if (!name || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

function toCsv(rows: Array<typeof contactMessages.$inferSelect>) {
  const headers = ["id", "name", "email", "projectType", "monthlyVolume", "message", "status", "lastReply", "repliedAt", "createdAt", "updatedAt"];
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((header) => {
          const value = row[header as keyof typeof row];
          return csvCell(value instanceof Date ? value.toISOString() : value ?? "");
        })
        .join(","),
    ),
  ];

  return lines.join("\r\n");
}

function csvCell(value: unknown) {
  const text = String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function parseCsv(input: string) {
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
      current = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);

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
