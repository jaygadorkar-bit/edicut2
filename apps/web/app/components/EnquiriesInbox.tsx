import { useEffect, useRef, useState } from "react";
import { Form, Link, useFetcher, useNavigation, useSearchParams } from "react-router";
import { AdminPanelShell } from "./AdminPanelShell";
import { WorkspaceShell } from "./WorkspaceShell";
import type { DashboardFeature } from "../lib/role-feature-access";
import "../styles/enquiries.css";

type MessageFilter = "all" | "replied" | "unreplied";
type MessageView = {
  id: string;
  name: string;
  email: string;
  projectType: string | null;
  monthlyVolume: string | null;
  message: string;
  lastReply: string | null;
  repliedAt: string | Date | null;
  status: string;
  createdAt: string | Date;
};

type EnquiriesInboxData = {
  user: { name: string | null; email: string; role: string; profileImageUrl?: string | null };
  allowedFeatures: DashboardFeature[];
  messages: MessageView[];
  filter: MessageFilter;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  repliedCount: number;
  unrepliedCount: number;
  unreadCount: number;
  flash: string;
  error: string;
};

const workspaceItems = [
  { label: "Dashboard", icon: "dashboard_customize", to: "/dashboard", feature: "overview" },
  { label: "Projects", icon: "video_library", to: "/dashboard/projects", feature: "projects" },
  { label: "Reviews", icon: "rate_review", to: "/dashboard/reviews", feature: "reviews" },
  { label: "Uploads", icon: "upload_file", to: "/dashboard/uploads", feature: "uploads" },
  { label: "Subscriptions", icon: "receipt_long", to: "/dashboard/subscriptions", feature: "billing" },
  { label: "Affiliates", icon: "hub", to: "/dashboard/affiliates", feature: "affiliates" },
  { label: "Enquiries", icon: "mail", to: "/dashboard/messages", feature: "support", active: true },
] satisfies Array<{ label: string; icon: string; to: string; feature: DashboardFeature; active?: boolean }>;

function Icon({ name }: { name: string }) {
  return <span className="material-symbols-outlined" aria-hidden="true">{name}</span>;
}

export function EnquiriesInbox({ data }: { data: EnquiriesInboxData }) {
  const { user, allowedFeatures, messages, filter, page, pageSize, total, totalPages, repliedCount, unrepliedCount, unreadCount, flash, error } = data;
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => setSelected([]), [messages]);
  const isSubmitting = navigation.state !== "idle";
  const currentPath = `/dashboard/messages?${params.toString()}`;
  const exportParams = new URLSearchParams(params);
  exportParams.delete("export");
  exportParams.delete("flash");
  exportParams.delete("error");
  const headerActions = <a href={`/dashboard/messages/export?${exportParams}`} className="neo-button enquiries-export"><Icon name="download" />Export CSV</a>;
  const account = { name: user.name || user.email, detail: user.email, imageUrl: user.profileImageUrl };
  const content = (
    <div className="enquiries-page">
      <VisibleEnquiryReadTracker messages={messages} />
      <div className="enquiries-heading">
        <div><h2>Enquiries</h2><p>Messages from contact forms across EdiCut appear here.</p></div>
        <Link to="/contact#contact" className="neo-button"><Icon name="open_in_new" />Contact form</Link>
      </div>
      {flash ? <p role="status" className="enquiries-notice enquiries-notice--success">{flash}</p> : null}
      {error ? <p role="alert" className="enquiries-notice enquiries-notice--error">{error}</p> : null}

      <section className="enquiries-metrics" aria-label="Enquiry summary">
        <Metric label={filter === "all" ? "All enquiries" : "Filtered enquiries"} value={total} icon="mail" />
        <Metric label="Awaiting reply" value={unrepliedCount} icon="mark_email_unread" />
        <Metric label="Replied" value={repliedCount} icon="mark_email_read" />
      </section>

      <section className="neo-workspace__panel enquiries-list" aria-label="Contact inbox">
        <div className="enquiries-toolbar">
          <nav className="enquiries-filters" aria-label="Filter enquiries">
            {([ ["all", "All enquiries"], ["unreplied", "Awaiting reply"], ["replied", "Replied"] ] as const).map(([value, label]) => (
              <Link key={value} to={filterHref(params, value)} aria-current={filter === value ? "page" : undefined} className={`enquiries-filter${filter === value ? " is-active" : ""}`}>{label}</Link>
            ))}
          </nav>
          <span className="enquiries-page-count">Page {page} of {totalPages}</span>
        </div>

        <details className="enquiries-import">
          <summary><Icon name="upload_file" />Import enquiries<Icon name="expand_more" /></summary>
          <Form method="post" encType="multipart/form-data" className="enquiries-import-form">
            <input type="hidden" name="intent" value="import" />
            <input type="hidden" name="returnTo" value={currentPath} />
            <label>CSV file<input name="importFile" type="file" accept=".csv,text/csv" className="neo-workspace__profile-input" /></label>
            <details><summary>Paste CSV instead</summary><label className="enquiries-csv-label"><span className="sr-only">CSV contents</span><textarea name="importCsv" rows={3} className="neo-workspace__profile-input" placeholder="name,email,projectType,monthlyVolume,message,status" /></label></details>
            <p>Up to 250 enquiries per import. Maximum file size: 1 MB.</p>
            <button type="submit" disabled={isSubmitting} className="neo-button neo-button--primary"><Icon name="upload_file" />Import CSV</button>
          </Form>
        </details>

        <Form id="bulk-delete-form" method="post" onSubmit={(event) => {
          const noun = selected.length === 1 ? "enquiry" : "enquiries";
          if (!window.confirm(`Permanently delete ${selected.length} selected ${noun}? This cannot be undone.`)) event.preventDefault();
        }}>
          <input type="hidden" name="intent" value="bulk-delete" />
          <input type="hidden" name="returnTo" value={currentPath} />
        </Form>
        {messages.length > 0 ? <div className="enquiries-selection">
          <label><input type="checkbox" checked={selected.length === messages.length} onChange={(event) => setSelected(event.target.checked ? messages.map(message => message.id) : [])} />Select this page</label>
          <button type="submit" form="bulk-delete-form" disabled={isSubmitting || selected.length === 0} className="enquiries-delete"><Icon name="delete" />Delete selected{selected.length ? ` (${selected.length})` : ""}</button>
        </div> : null}

        {messages.length === 0 ? <div className="enquiries-empty"><span className="neo-icon-badge"><Icon name="inbox" /></span><h3>{filter === "all" ? "No enquiries yet" : "No enquiries in this view"}</h3><p>{filter === "all" ? "New contact form submissions will appear here." : "Choose another filter to see your other enquiries."}</p></div> : (
          <div className="enquiries-messages">
            {messages.map((message) => <article key={message.id} className="enquiry" data-enquiry-id={message.id} data-enquiry-read={isUnreadEnquiry(message) ? "unread" : "read"}>
              <label className="enquiry-select"><input form="bulk-delete-form" name="messageIds" value={message.id} type="checkbox" checked={selected.includes(message.id)} onChange={(event) => setSelected(current => event.target.checked ? [...current, message.id] : current.filter(id => id !== message.id))} /><span className="sr-only">Select enquiry from {message.name}</span></label>
              <div className="enquiry-content">
                <div className="enquiry-header">
                  <div className="enquiry-sender"><span className="neo-icon-badge"><Icon name="person" /></span><div><h3>{message.name}</h3><a href={`mailto:${message.email}`}>{message.email}</a></div></div>
                  <div className="enquiry-meta"><span className={`enquiry-status${message.repliedAt ? " is-replied" : ""}`}>{message.repliedAt ? "Replied" : "Awaiting reply"}</span><time dateTime={new Date(message.createdAt).toISOString()}>{formatDate(message.createdAt)}</time></div>
                </div>
                {message.projectType || message.monthlyVolume ? <div className="enquiry-details">{message.projectType ? <span><Icon name="video_library" />{message.projectType}</span> : null}{message.monthlyVolume ? <span><Icon name="calendar_month" />{message.monthlyVolume}</span> : null}</div> : null}
                <p className="enquiry-message">{message.message}</p>
                {message.lastReply ? <div className="neo-inset enquiry-last-reply"><p>Last reply</p><p>{message.lastReply}</p></div> : null}
                <details className="enquiry-reply"><summary><Icon name="reply" />Reply to {message.name}<Icon name="expand_more" /></summary><ReplyForm message={message} returnTo={currentPath} isSubmitting={isSubmitting} isSending={isSubmitting && navigation.formData?.get("intent") === "reply" && navigation.formData.get("messageId") === message.id} /></details>
              </div>
            </article>)}
          </div>
        )}
        <div className="enquiries-pagination">
          <p>{total ? `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} enquiries` : "0 enquiries"}</p>
          <nav aria-label="Enquiry pages"><PageLink label="Previous" icon="chevron_left" page={page - 1} params={params} disabled={page <= 1} /><PageLink label="Next" icon="chevron_right" page={page + 1} params={params} disabled={page >= totalPages} /></nav>
        </div>
      </section>
    </div>
  );
  return user.role === "admin" ? <AdminPanelShell title="Enquiries" activeTab="messages" account={account} unreadEnquiryCount={unreadCount} headerActions={headerActions}>{content}</AdminPanelShell> : (
    <WorkspaceShell title="Enquiries" navItems={workspaceItems.filter(item => allowedFeatures.includes(item.feature)).map(item => item.feature === "support" ? { ...item, unreadCount } : item)} account={account} mobileMenu mobileBottomNav={false} headerActions={headerActions} profileTo={allowedFeatures.includes("settings") ? "/dashboard/profile" : null} profileNavAtBottom settingsTo={allowedFeatures.includes("settings") ? "/dashboard/settings" : null} startProjectTo={allowedFeatures.includes("projects") ? "/dashboard/projects#new-project" : null} notificationsTo={allowedFeatures.includes("reviews") ? "/dashboard/reviews" : null} accountAction={<Form method="post" action="/signout"><button type="submit" aria-label="Sign out"><Icon name="logout" /></button></Form>}>{content}</WorkspaceShell>
  );
}

function VisibleEnquiryReadTracker({ messages }: { messages: MessageView[] }) {
  const fetcher = useFetcher();
  const submittedIds = useRef(new Set<string>());
  const pendingIds = useRef(new Set<string>());
  const [pendingRevision, setPendingRevision] = useState(0);
  const unreadIds = messages.filter(isUnreadEnquiry).map(message => message.id);
  const unreadKey = unreadIds.join("\u0000");

  useEffect(() => {
    if (!unreadIds.length || typeof IntersectionObserver === "undefined") return;
    const eligible = new Set(unreadIds);
    const observer = new IntersectionObserver(entries => {
      let changed = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = (entry.target as HTMLElement).dataset.enquiryId;
        if (!id || !eligible.has(id) || submittedIds.current.has(id) || pendingIds.current.has(id)) continue;
        pendingIds.current.add(id);
        changed = true;
      }
      if (changed) setPendingRevision(revision => revision + 1);
    }, { threshold: 0.12 });

    document.querySelectorAll<HTMLElement>('.enquiries-page [data-enquiry-read="unread"]').forEach(element => {
      if (eligible.has(element.dataset.enquiryId || "")) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [unreadKey]);

  useEffect(() => {
    if (fetcher.state !== "idle" || pendingIds.current.size === 0) return;
    const ids = Array.from(pendingIds.current).slice(0, 10);
    const form = new FormData();
    form.set("intent", "mark-read");
    for (const id of ids) {
      pendingIds.current.delete(id);
      submittedIds.current.add(id);
      form.append("messageIds", id);
    }
    fetcher.submit(form, { method: "post", action: "/dashboard/messages" });
  }, [fetcher.state, fetcher.submit, pendingRevision]);

  return null;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: string }) {
  return <article className="neo-workspace__metric-card enquiries-metric"><div><p>{label}</p><strong className="neo-workspace__metric-value">{value}</strong></div><span className="neo-icon-badge"><Icon name={icon} /></span></article>;
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Dhaka" }).format(new Date(value));
}

function isUnreadEnquiry(message: Pick<MessageView, "status" | "repliedAt">) {
  return !message.repliedAt && message.status !== "read";
}

function filterHref(params: URLSearchParams, filter: MessageFilter) {
  const next = new URLSearchParams(params);
  next.set("filter", filter);
  next.set("page", "1");
  for (const key of ["flash", "error", "export"]) next.delete(key);
  return `/dashboard/messages?${next}`;
}

function PageLink({ label, icon, page, params, disabled }: { label: string; icon: string; page: number; params: URLSearchParams; disabled: boolean }) {
  const next = new URLSearchParams(params);
  next.set("page", String(Math.max(1, page)));
  for (const key of ["flash", "error", "export"]) next.delete(key);
  return <Link to={`/dashboard/messages?${next}`} aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} className={`neo-button${disabled ? " is-disabled" : ""}`}><Icon name={icon} />{label}</Link>;
}

function ReplyForm({ message, returnTo, isSubmitting, isSending }: { message: MessageView; returnTo: string; isSubmitting: boolean; isSending: boolean }) {
  return <Form method="post" className="enquiry-reply-form">
    <input type="hidden" name="intent" value="reply" /><input type="hidden" name="messageId" value={message.id} /><input type="hidden" name="returnTo" value={returnTo} />
    <label>Subject<input name="subject" required maxLength={160} defaultValue="Re: Your EdiCut inquiry" className="neo-workspace__profile-input" /></label>
    <label>Reply<textarea name="reply" required minLength={2} maxLength={10_000} rows={4} className="neo-workspace__profile-input" placeholder={`Write a reply to ${message.name}`} /></label>
    <button type="submit" disabled={isSubmitting} className="neo-button neo-button--primary"><Icon name="send" />{isSending ? "Sending…" : "Send reply"}</button>
  </Form>;
}
