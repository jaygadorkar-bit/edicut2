import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "react-router";
import { Form, Link, redirect, useLoaderData, useNavigation } from "react-router";
import { useState } from "react";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { contactMessages } from "@edicut/db/schema";
import { ArrowUpRight, BriefcaseBusiness, ChevronLeft, ChevronRight, FileVideo, Search, Trash2 } from "lucide-react";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { useMarkNotificationRead } from "../components/WorkspaceNotifications";
import { getDbFromContext } from "../lib/db.server";
import { adminPath } from "../lib/admin-paths";
import { getPageWithinRange, getPositivePage } from "../lib/admin-data-requirements";
import { VIDEO_EDITOR_PARTNER_APPLICATION_TYPE } from "../lib/contact-message-filters.server";
import { toPublicAdminUser } from "../lib/admin-public";
import { requireAdminUser } from "../lib/session.server";
import { forbiddenMutation, isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import "../styles/admin-recruiting-forms.css";

const PAGE_SIZE = 15;
const APPLICATION_ID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export const meta: MetaFunction = () => [
  { title: "Recruiting forms | EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() {
  return { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" };
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (!isSameSiteMutation(request)) return forbiddenMutation();

  const form = await readMutationForm(request, 8 * 1024);
  if (!form) return redirect(recruitingFormsHref({ error: "invalid" }));

  const db = getDbFromContext(context);
  await requireAdminUser(request, db, context, new URL(request.url).pathname);

  const applicationId = String(form.get("applicationId") ?? "").trim();
  const query = String(form.get("q") ?? "").trim().slice(0, 120);
  const page = getPositivePage(String(form.get("page") ?? "1"));
  if (!APPLICATION_ID_PATTERN.test(applicationId)) {
    return redirect(recruitingFormsHref({ query, page, error: "invalid" }));
  }

  const [deleted] = await db.delete(contactMessages)
    .where(and(eq(contactMessages.id, applicationId), eq(contactMessages.projectType, VIDEO_EDITOR_PARTNER_APPLICATION_TYPE)))
    .returning({ id: contactMessages.id });

  if (!deleted) return redirect(recruitingFormsHref({ query, page, error: "missing" }));
  return redirect(recruitingFormsHref({ query, page, deleted: true }));
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const admin = await requireAdminUser(request, db, context, new URL(request.url).pathname);
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const escapedQuery = query.replace(/[\\%_]/g, "\\$&");
  const where = query
    ? and(
        eq(contactMessages.projectType, VIDEO_EDITOR_PARTNER_APPLICATION_TYPE),
        or(
          ilike(contactMessages.name, `%${escapedQuery}%`),
          ilike(contactMessages.email, `%${escapedQuery}%`),
        ),
      )
    : eq(contactMessages.projectType, VIDEO_EDITOR_PARTNER_APPLICATION_TYPE);

  const [countRows] = await Promise.all([
    db.select({ total: count() }).from(contactMessages).where(where),
  ]);
  const total = Number(countRows[0]?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = getPageWithinRange(getPositivePage(url.searchParams.get("page")), totalPages);
  const records = await db
    .select({ id: contactMessages.id, name: contactMessages.name, email: contactMessages.email, message: contactMessages.message, createdAt: contactMessages.createdAt })
    .from(contactMessages)
    .where(where)
    .orderBy(desc(contactMessages.createdAt), desc(contactMessages.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return {
    admin: toPublicAdminUser(admin),
    records: records.map((record) => ({ ...record, answers: parseApplicationAnswers(record.message) })),
    query,
    page,
    total,
    totalPages,
    deleted: url.searchParams.get("deleted") === "1",
    error: url.searchParams.get("error") === "missing" ? "missing" : url.searchParams.get("error") === "invalid" ? "invalid" : "",
  };
}

export default function AdminRecruitingFormsPage() {
  const { admin, records, query, page, total, totalPages, deleted, error } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const markNotificationRead = useMarkNotificationRead();
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const makePageHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    params.set("page", String(nextPage));
    return `${adminPath("/recruiting-forms")}?${params}`;
  };

  return (
    <AdminPanelShell title="Recruiting forms" activeTab="recruiting-forms" account={{ name: admin.name || admin.email, detail: admin.email }}>
      <div className="recruiting-page">
        <header className="recruiting-heading">
          <div>
            <p className="recruiting-eyebrow"><BriefcaseBusiness size={15} aria-hidden="true" />Partner recruitment</p>
            <h1>Recruiting forms</h1>
            <p>Review video editor partner applications and the details candidates shared.</p>
          </div>
          <div className="recruiting-count" aria-label={`${total} applications`}>
            <FileVideo size={20} aria-hidden="true" />
            <span><strong>{total}</strong> {total === 1 ? "application" : "applications"}</span>
          </div>
        </header>

        {deleted ? <p className="recruiting-notice recruiting-notice--success" role="status">Application deleted.</p> : null}
        {error ? <p className="recruiting-notice recruiting-notice--error" role="alert">{error === "missing" ? "That application was already deleted or could not be found." : "We couldn’t delete that application. Refresh the list and try again."}</p> : null}

        <section className="neo-workspace__panel recruiting-list" aria-label="Video editor applications">
          <div className="recruiting-toolbar">
            <Form method="get" action={adminPath("/recruiting-forms")} role="search" className="recruiting-search">
              <label className="sr-only" htmlFor="recruiting-search">Search candidates</label>
              <Search size={18} aria-hidden="true" />
              <input id="recruiting-search" type="search" name="q" defaultValue={query} maxLength={120} placeholder="Search name or email" />
              <button type="submit">Search</button>
            </Form>
            <span className="recruiting-results-count">{total} {total === 1 ? "result" : "results"}</span>
          </div>

          {!records.length ? (
            <div className="recruiting-empty">
              <span className="recruiting-empty__icon"><FileVideo size={30} aria-hidden="true" /></span>
              <div className="recruiting-empty__copy">
                <h2>{query ? "No matching applications" : "No applications yet"}</h2>
                <p>{query ? "Try another name or email address." : "Video editor partner applications will appear here after candidates submit the form."}</p>
                {!query ? <a href="/video-editor-partner" target="_blank" rel="noreferrer" className="recruiting-empty__link">Preview the partner form <ArrowUpRight size={16} aria-hidden="true" /></a> : null}
              </div>
            </div>
          ) : (
            <div className="recruiting-sheet-wrap" role="region" aria-label="Applications spreadsheet" tabIndex={0}>
              <table className="recruiting-sheet">
                <caption className="sr-only">Video editor partner applications, with candidate details and review actions</caption>
                <colgroup>
                  <col className="recruiting-sheet__col-candidate" />
                  <col className="recruiting-sheet__col-arrangement" />
                  <col className="recruiting-sheet__col-experience" />
                  <col className="recruiting-sheet__col-thumbnails" />
                  <col className="recruiting-sheet__col-submitted" />
                  <col className="recruiting-sheet__col-answers" />
                  <col className="recruiting-sheet__col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Candidate</th>
                    <th scope="col">Work arrangement</th>
                    <th scope="col">Editing experience</th>
                    <th scope="col">Thumbnail design</th>
                    <th scope="col">Submitted</th>
                    <th scope="col">Application</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                {records.map((record) => {
                  const isExpanded = expandedRecordId === record.id;
                  return (
                    <tbody key={record.id}>
                      <tr className="recruiting-sheet__row">
                        <th scope="row" className="recruiting-sheet__candidate">
                          <span>{record.name}</span>
                          <a href={`mailto:${record.email}`}>{record.email}</a>
                        </th>
                        <td>{getAnswerValue(record.answers, "Work arrangement")}</td>
                        <td>{getAnswerValue(record.answers, "Editing experience")}</td>
                        <td>{getAnswerValue(record.answers, "Designs thumbnails")}</td>
                        <td><time dateTime={new Date(record.createdAt).toISOString()}>{formatDate(record.createdAt)}</time></td>
                        <td>
                          <button
                            type="button"
                            className="recruiting-review-toggle"
                            aria-expanded={isExpanded}
                            aria-controls={`recruiting-answers-${record.id}`}
                            onClick={() => {
                              if (!isExpanded) markNotificationRead("recruiting", record.id);
                              setExpandedRecordId(isExpanded ? null : record.id);
                            }}
                          >
                            {isExpanded ? "Hide answers" : "View answers"}<span>({record.answers.length})</span>
                          </button>
                        </td>
                        <td>
                          <Form method="post" className="recruiting-delete-form" onSubmit={(event) => {
                            if (!window.confirm(`Permanently delete ${record.name}’s application? This cannot be undone.`)) event.preventDefault();
                          }}>
                            <input type="hidden" name="applicationId" value={record.id} />
                            <input type="hidden" name="q" value={query} />
                            <input type="hidden" name="page" value={page} />
                            <button type="submit" className="recruiting-delete" disabled={navigation.state !== "idle"} aria-label={`Delete ${record.name}’s application`}>
                              <Trash2 size={15} aria-hidden="true" /><span>Delete</span>
                            </button>
                          </Form>
                        </td>
                      </tr>
                      <tr className="recruiting-sheet__expanded" id={`recruiting-answers-${record.id}`} hidden={!isExpanded}>
                        <td colSpan={7}>
                          {record.answers.length ? (
                            <div className="recruiting-answer-sheet-wrap" role="region" aria-label={`${record.name} application answers`} tabIndex={0}>
                              <table className="recruiting-answer-sheet">
                                <caption className="sr-only">Submitted application answers for {record.name}</caption>
                                <colgroup>
                                  <col className="recruiting-answer-sheet__col-number" />
                                  <col className="recruiting-answer-sheet__col-field" />
                                  <col />
                                </colgroup>
                                <thead>
                                  <tr>
                                    <th scope="col">#</th>
                                    <th scope="col">Field</th>
                                    <th scope="col">Response</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {record.answers.map((answer, index) => (
                                    <tr key={`${record.id}-${index}`}>
                                      <td className="recruiting-answer-sheet__row-number">{index + 1}</td>
                                      <th scope="row">{answer.label}</th>
                                      <td>{answer.value || "Not provided"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : <p className="recruiting-no-answers">No saved answers were found for this application.</p>}
                        </td>
                      </tr>
                    </tbody>
                  );
                })}
              </table>
            </div>
          )}

          <footer className="recruiting-pagination">
            <span>Page {page} of {totalPages}</span>
            <nav aria-label="Application pages">
              {page > 1 ? <Link to={makePageHref(page - 1)}><ChevronLeft size={17} aria-hidden="true" />Previous</Link> : <span className="is-disabled"><ChevronLeft size={17} aria-hidden="true" />Previous</span>}
              {page < totalPages ? <Link to={makePageHref(page + 1)}>Next<ChevronRight size={17} aria-hidden="true" /></Link> : <span className="is-disabled">Next<ChevronRight size={17} aria-hidden="true" /></span>}
            </nav>
          </footer>
        </section>
      </div>
    </AdminPanelShell>
  );
}

function parseApplicationAnswers(message: string) {
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== VIDEO_EDITOR_PARTNER_APPLICATION_TYPE)
    .map((line) => {
      const separator = line.indexOf(":");
      if (separator < 0) return { label: "Additional detail", value: line };
      return { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
    });
}

function getAnswerValue(answers: ReturnType<typeof parseApplicationAnswers>, label: string) {
  return answers.find((answer) => answer.label.toLocaleLowerCase() === label.toLocaleLowerCase())?.value || "—";
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function recruitingFormsHref({ query = "", page = 1, deleted, error }: { query?: string; page?: number; deleted?: boolean; error?: "missing" | "invalid" }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query.slice(0, 120));
  params.set("page", String(getPositivePage(String(page))));
  if (deleted) params.set("deleted", "1");
  if (error) params.set("error", error);
  return `${adminPath("/recruiting-forms")}?${params.toString()}`;
}
