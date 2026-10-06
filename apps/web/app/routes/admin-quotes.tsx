import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { customQuotes } from "@edicut/db/schema";
import { customQuoteOptionsSchema, quoteProjectTypes, quoteStatuses, quoteStatusSchema, quoteOptionLabel } from "@edicut/shared/contracts/custom-quotes";
import { CheckCircle2, ChevronDown, FileText, Mail, MessageCircle, Search } from "lucide-react";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { QuoteDetails } from "../components/QuoteDetails";
import { getDbFromContext } from "../lib/db.server";
import { isAdminRole, requireAdminUser } from "../lib/session.server";
import { toPublicAdminUser } from "../lib/admin-public";
import { getPageWithinRange, getPositivePage } from "../lib/admin-data-requirements";
import { isSameSiteMutation, readSubscriptionForm } from "../lib/customer-subscriptions.server";
import { consumeUsageLimit, requestBodyExceedsLimit } from "../lib/usage-protection.server";
import { isWorkspaceRecordId } from "../lib/workspace";
import { adminPath } from "../lib/admin-paths";
import "../styles/custom-quotes.css";

const PAGE_SIZE = 15;
export const meta: MetaFunction = () => [{ title: "Custom quotes | EdiCut Admin" }, { name: "robots", content: "noindex,nofollow" }];
export function headers() { return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }; }
async function adminAccess(request: Request, context: LoaderFunctionArgs["context"]) {
  const db = getDbFromContext(context);
  const admin = await requireAdminUser(request, db, context);
  if (!admin.active || !isAdminRole(admin.role)) throw new Response("Permission denied", { status: 403 });
  return { db, admin };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { db, admin } = await adminAccess(request, context);
  const url = new URL(request.url);
  const parsedStatus = quoteStatusSchema.safeParse(url.searchParams.get("status"));
  const status = parsedStatus.success ? parsedStatus.data : "all";
  const where = status === "all" ? undefined : eq(customQuotes.status, status);
  const [filtered, summaryRows] = await Promise.all([
    db.select({ count: count() }).from(customQuotes).where(where),
    db.select({ total: count(), new: sql<number>`count(*) FILTER (WHERE ${customQuotes.status} = 'new')`.mapWith(Number), reviewing: sql<number>`count(*) FILTER (WHERE ${customQuotes.status} = 'reviewing')`.mapWith(Number), contacted: sql<number>`count(*) FILTER (WHERE ${customQuotes.status} = 'contacted')`.mapWith(Number), closed: sql<number>`count(*) FILTER (WHERE ${customQuotes.status} = 'closed')`.mapWith(Number) }).from(customQuotes),
  ]);
  const total = Number(filtered[0]?.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = getPageWithinRange(getPositivePage(url.searchParams.get("page")), totalPages);
  const records = await db.select().from(customQuotes).where(where).orderBy(desc(customQuotes.createdAt), desc(customQuotes.id)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  return { admin: toPublicAdminUser(admin), records, status, page, total, totalPages, summary: summaryRows[0] || { total: 0, new: 0, reviewing: 0, contacted: 0, closed: 0 } };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return data({ error: "Please submit changes from this site.", success: "" }, { status: 403 });
  if (requestBodyExceedsLimit(request, 8 * 1024)) return data({ error: "This update is too large.", success: "" }, { status: 413 });
  const { db, admin } = await adminAccess(request, context);
  const form = await readSubscriptionForm(request, 8 * 1024);
  const status = quoteStatusSchema.safeParse(form?.get("status"));
  const id = String(form?.get("quoteId") || "");
  const expectedUpdatedAt = String(form?.get("expectedUpdatedAt") || "");
  const expectedDate = new Date(expectedUpdatedAt);
  const notes = String(form?.get("internalNotes") || "").trim();
  if (!form || form.get("intent") !== "update-quote" || !status.success || !isWorkspaceRecordId(id) || Number.isNaN(expectedDate.valueOf()) || expectedDate.toISOString() !== expectedUpdatedAt || notes.length > 4000) return data({ error: "Submit a valid request status and keep internal notes under 4,000 characters.", success: "" }, { status: 400 });
  const limit = await consumeUsageLimit({ request, context, bindingName: "USER_ACTION_LIMITER", key: `admin:${admin.id}`, localLimit: 60, localPeriodSeconds: 60 });
  if (limit !== "allowed") return data({ error: "Please wait a minute and try again.", success: "" }, { status: 429 });
  try {
    const [updated] = await db.update(customQuotes).set({ status: status.data, internalNotes: notes || null, updatedAt: new Date() })
      .where(and(eq(customQuotes.id, id), sql`date_trunc('milliseconds', ${customQuotes.updatedAt}) = ${expectedUpdatedAt}::timestamptz`)).returning();
    return updated ? { error: "", success: "Quote request updated." } : data({ error: "This request changed while you were reviewing it. Refresh and try again.", success: "" }, { status: 409 });
  } catch {
    console.error("Unable to update custom quote request");
    return data({ error: "The update could not be saved. Refresh and try again.", success: "" }, { status: 503 });
  }
}

export default function AdminQuotesPage() {
  const { admin, records, status, page, total, totalPages, summary } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";
  const href = (filter: string, nextPage = 1) => `${adminPath("/quotes")}?${new URLSearchParams({ status: filter, page: String(nextPage) })}`;
  return <AdminPanelShell title="Custom quotes" activeTab="quotes" account={{ name: admin.name || admin.email, detail: admin.email }}>
    <div className="admin-quotes-page">
      <div className="admin-quotes-heading"><div><h2>Custom quotes</h2><p>Review the scope clients need and follow up with a tailored quote.</p></div><Link className="neo-button" to="/custom-quote"><FileText size={17} aria-hidden="true" />Quote form</Link></div>
      {result?.error || result?.success ? <p role={result.error ? "alert" : "status"} className={`quote-admin-notice${result.error ? " is-error" : ""}`}>{result.error || result.success}</p> : null}
      <section className="quote-admin-metrics" aria-label="Quote request summary">{[
        ["All requests", summary.total, <FileText key="all" size={21} aria-hidden="true" />], ["New requests", summary.new, <Mail key="new" size={21} aria-hidden="true" />], ["Reviewing", summary.reviewing, <Search key="reviewing" size={21} aria-hidden="true" />], ["Contacted / closed", Number(summary.contacted) + Number(summary.closed), <CheckCircle2 key="done" size={21} aria-hidden="true" />],
      ].map(([label, value, icon]) => <article className="neo-workspace__metric-card" key={String(label)}><div><p>{label}</p><strong>{value}</strong></div><span className="neo-icon-badge">{icon}</span></article>)}</section>
      <section className="neo-workspace__panel quote-admin-list" aria-label="Custom quote requests"><div className="quote-admin-list-heading"><nav aria-label="Filter custom quotes">{Object.entries({ all: "All requests", ...quoteStatuses }).map(([value, label]) => <Link key={value} to={href(value)} aria-current={status === value ? "page" : undefined} className={status === value ? "is-active" : ""}>{label}</Link>)}</nav><span>{total} {total === 1 ? "request" : "requests"}</span></div>
        {!records.length ? <div className="quote-admin-empty"><span className="neo-icon-badge"><FileText size={28} aria-hidden="true" /></span><h3>{status === "all" ? "No custom quote requests yet" : "No requests in this view"}</h3><p>{status === "all" ? "Requests submitted from the custom quote form will appear here with the customer’s account details and selected options." : "Choose another status to review your other requests."}</p></div> : records.map(record => {
          const parsed = customQuoteOptionsSchema.safeParse(record.options);
          return <article key={`${record.id}:${new Date(record.updatedAt).toISOString()}`} className="quote-admin-record"><header><div><span className={`quote-status quote-status--${record.status}`}>{quoteOptionLabel(quoteStatuses, record.status)}</span><h3>{record.title}</h3><p>{record.customerName} <a href={`mailto:${record.customerEmail}`}>{record.customerEmail}</a></p></div><div className="quote-admin-record-meta"><time dateTime={new Date(record.createdAt).toISOString()}>{formatDate(record.createdAt)}</time><span>Reference {record.id.slice(0, 8).toUpperCase()}</span></div></header>
            <div className="quote-admin-scope"><FileText size={16} aria-hidden="true" /><span>{parsed.success ? `${quoteOptionLabel(quoteProjectTypes, parsed.data.projectType)} · ${parsed.data.videoCount} ${parsed.data.videoCount === 1 ? "video" : "videos"} · ${parsed.data.services.length} services` : "Saved custom request"}</span><span><MessageCircle size={15} aria-hidden="true" />Prefers {record.preferredContact === "whatsapp" ? `WhatsApp${record.phone ? `: ${record.phone}` : ""}` : "email"}</span>{record.phone && record.preferredContact !== "whatsapp" ? <span>Phone: {record.phone}</span> : null}</div>
            <details className="quote-admin-details"><summary>Review options and brief<ChevronDown size={17} aria-hidden="true" /></summary>{parsed.success ? <QuoteDetails options={parsed.data} /> : <p role="alert" className="quote-admin-notice is-error">This request uses an unsupported options format. Contact the customer for their brief.</p>}
              <Form method="post" className="quote-admin-update"><input type="hidden" name="intent" value="update-quote" /><input type="hidden" name="quoteId" value={record.id} /><input type="hidden" name="expectedUpdatedAt" value={new Date(record.updatedAt).toISOString()} /><label className="quote-field" htmlFor={`status-${record.id}`}><span>Request status</span><select className="neo-inset" id={`status-${record.id}`} name="status" defaultValue={record.status}>{Object.entries(quoteStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="quote-field" htmlFor={`notes-${record.id}`}><span>Internal notes</span><textarea className="neo-inset" rows={3} maxLength={4000} id={`notes-${record.id}`} name="internalNotes" defaultValue={record.internalNotes || ""} placeholder="Scope decisions, pricing notes, or follow-up details" /><small>Visible only to admins. Updating the status does not send an email.</small></label><button type="submit" className="neo-button" disabled={busy}>{busy && navigation.formData?.get("quoteId") === record.id ? "Saving…" : "Save request update"}</button></Form>
            </details>
          </article>;
        })}
        <div className="quote-admin-pagination"><span>Page {page} of {totalPages}</span><nav aria-label="Quote request pages">{page > 1 ? <Link className="neo-button" to={href(status, page - 1)}>Previous</Link> : <span className="quote-disabled-page">Previous</span>}{page < totalPages ? <Link className="neo-button" to={href(status, page + 1)}>Next</Link> : <span className="quote-disabled-page">Next</span>}</nav></div>
      </section>
    </div>
  </AdminPanelShell>;
}
function formatDate(value: string | Date) { return new Intl.DateTimeFormat("en", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
