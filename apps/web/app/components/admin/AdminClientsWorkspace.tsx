import { Select } from "../Select";
import { useState } from "react";
import {
  Form,
  Link,
  useFetcher,
  useActionData,
  useNavigation,
  useRevalidator,
  useSearchParams,
} from "react-router";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  ExternalLink,
  FileVideo,
  MessageSquare,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react";
import { AdminOrdersWorkspace } from "./AdminOrdersWorkspace";
import { AdminPanelShell } from "../AdminPanelShell";
import { adminPath } from "../../lib/admin-paths";
import {
  CLIENT_DETAIL_PAGE_SIZE,
  CLIENT_EVENT_PAGE_SIZE,
  type AdminClient,
  type ClientEvent,
  type ClientProject,
} from "../../lib/admin-clients";
import { projectStatusLabel } from "../../lib/project-review";
import type { loader, action } from "../../routes/admin-clients";

type Data = Awaited<ReturnType<typeof loader>>;
const base = adminPath("/clients");
const billingLabels: Record<string, string> = {
  paid: "Paid",
  invoice_pending: "Invoice sent",
  quote_approved: "Quote confirmed",
  quote_requested: "Quote requested",
};
function date(value: string | null, time = false) {
  if (!value) return "Not set";
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed.valueOf())) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
    timeZone: "UTC",
  }).format(parsed);
}
function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
function PaymentBadge({ client }: { client: AdminClient }) {
  const paid = client.paidOrders > 0 || client.paidProjects > 0;
  return (
    <span
      className={`clients-badge ${paid ? "clients-badge--green" : "clients-badge--muted"}`}
    >
      {paid
        ? "Paid client"
        : client.orderCount || client.projectCount
          ? "Unpaid"
          : "No orders"}
    </span>
  );
}
function Result({
  data,
}: {
  data?: { error?: string; success?: string; warning?: string };
}) {
  if (!data) return null;
  return (
    <div
      className={`clients-result ${data.error ? "is-error" : ""}`}
      role={data.error ? "alert" : "status"}
    >
      {data.error || data.success}
      {data.warning ? <p>{data.warning}</p> : null}
    </div>
  );
}
function ManagerAssignment({
  client,
  managers,
}: {
  client: AdminClient;
  managers: Data["managers"];
}) {
  const fetcher = useFetcher<typeof action>(),
    [chosen, setChosen] = useState(client.managerId || "");
  const busy = fetcher.state !== "idle",
    missing =
      client.managerId &&
      !managers.some((manager) => manager.id === client.managerId);
  return (
    <section className="clients-manager" aria-label="Client manager assignment">
      <div>
        <span className="clients-field-title">
          <Users size={15} aria-hidden="true" />
          Project manager
        </span>
        <p>
          {client.managerActive
            ? "Access to this client's projects"
            : "Assign a manager to give them project access"}
        </p>
      </div>
      <fetcher.Form method="post" action={base}>
        <input type="hidden" name="intent" value="assign-manager" />
        <input type="hidden" name="clientId" value={client.id} />
        <input
          type="hidden"
          name="expectedManagerId"
          value={client.managerId || ""}
        />
        <label className="sr-only" htmlFor="client-manager">
          Manager for {client.name || client.email}
        </label>
        <Select
          id="client-manager"
          name="managerId"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          disabled={busy || (!client.active && !client.managerId)}
        >
          <option value="">Not assigned</option>
          {missing ? (
            <option value={client.managerId!} disabled>
              {client.managerName || "Previous manager"} (unavailable)
            </option>
          ) : null}
          {managers.map((manager) => (
            <option
              key={manager.id}
              value={manager.id}
              disabled={!client.active}
            >
              {manager.name}
              {manager.email !== manager.name ? ` — ${manager.email}` : ""} (
              {manager.clients} client
              {manager.clients === 1 ? "" : "s"})
            </option>
          ))}
        </Select>
        <button
          className="clients-button clients-button--primary"
          disabled={busy || chosen === (client.managerId || "")}
          type="submit"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </fetcher.Form>
      {!client.active ? (
        <p className="clients-help">
          This account is inactive. You can remove its manager; activate the
          account to assign someone new.
        </p>
      ) : null}
      {!managers.length ? (
        <p className="clients-help">
          Create an active project manager in Role manager to assign one here.
        </p>
      ) : null}
      <Result data={fetcher.data} />
    </section>
  );
}
function EditorAssignment({
  project,
  client,
  editors,
}: {
  project: ClientProject;
  client: AdminClient;
  editors: Data["editors"];
}) {
  const current =
    project.editors.find((editor) => editor.active)?.id ||
    project.editors[0]?.id ||
    "";
  const [chosen, setChosen] = useState(current),
    fetcher = useFetcher<typeof action>(),
    busy = fetcher.state !== "idle";
  return (
    <div>
      <fetcher.Form method="post" action={base} className="clients-editor-form">
        <input type="hidden" name="intent" value="assign-project-editor" />
        <input type="hidden" name="clientId" value={client.id} />
        <input type="hidden" name="projectId" value={project.id} />
        <input
          type="hidden"
          name="expectedRevision"
          value={project.reviewRevision}
        />
        <label htmlFor={`editor-${project.id}`}>Editor</label>
        <Select
          id={`editor-${project.id}`}
          name="userId"
          aria-label={`Editor for ${project.title}`}
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
          disabled={busy || !client.active}
        >
          <option value="" disabled>
            Choose editor
          </option>
          {current && !editors.some((editor) => editor.id === current) ? (
            <option value={current} disabled>
              Previous editor (unavailable)
            </option>
          ) : null}
          {editors.map((editor) => (
            <option key={editor.id} value={editor.id}>
              {editor.name} ({editor.activeProjects || 0} active project
              {editor.activeProjects === 1 ? "" : "s"})
            </option>
          ))}
        </Select>
        <button
          type="submit"
          className="clients-button"
          disabled={
            busy ||
            !chosen ||
            !client.active ||
            (chosen === current && project.editors.length <= 1)
          }
        >
          {busy ? "Saving…" : current ? "Save" : "Assign"}
        </button>
      </fetcher.Form>
      {project.editors.length > 1 ? (
        <p className="clients-help">
          Saving replaces this project's {project.editors.length} editor
          assignments with the selected editor.
        </p>
      ) : null}
      <Result data={fetcher.data} />
    </div>
  );
}
function eventTo(event: ClientEvent, clientId: string) {
  if (event.projectId)
    return adminPath(
      `/projects/${event.projectId}${event.versionId ? `?version=${event.versionId}` : ""}`,
    );
  if (event.kind === "order" || event.kind === "payment")
    return `${base}?client=${clientId}&section=orders&event=${event.entityId}#client-detail`;
  if (event.kind === "quote")
    return adminPath(`/quotes?event=${event.entityId}`);
  if (event.kind === "enquiry")
    return `/dashboard/messages?event=${event.entityId}`;
  return `${base}?client=${clientId}&section=projects#client-detail`;
}
function EventIcon({ kind }: { kind: string }) {
  const Icon =
    kind === "payment" || kind === "order"
      ? CreditCard
      : kind === "review"
        ? FileVideo
        : kind === "assignment"
          ? Users
          : kind === "enquiry"
            ? MessageSquare
            : Clock3;
  return <Icon size={15} aria-hidden="true" />;
}
function Pagination({
  page,
  total,
  size,
  to,
  label,
}: {
  page: number;
  total: number;
  size: number;
  to: (page: number) => string;
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav className="clients-pagination" aria-label={`${label} pagination`}>
      <span>
        Page {page} of {pages}
      </span>
      <div>
        {page > 1 ? (
          <Link
            to={to(page - 1)}
            className="clients-button"
            aria-label={`Previous ${label} page`}
          >
            <ChevronLeft size={15} aria-hidden="true" />
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link
            to={to(page + 1)}
            className="clients-button"
            aria-label={`Next ${label} page`}
          >
            Next
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

export function AdminClientsWorkspace({ data }: { data: Data }) {
  const [params] = useSearchParams(),
    navigation = useNavigation(),
    revalidator = useRevalidator();
  const { directory, detail, filters, managers, editors, conversations } = data;
  const result = useActionData<typeof action>();
  const busy = navigation.state !== "idle" || revalidator.state !== "idle";
  const href = (patch: Record<string, string | null>, anchor = "") => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    return `${base}?${next}${anchor}`;
  };
  const section = ["orders", "activity", "conversations"].includes(
    params.get("section") || "",
  )
    ? params.get("section")!
    : "projects";
  const summary = directory.summary,
    selected = detail?.client;
  const room = conversations.rooms.find((room) => room.kind === "manager");
  const filtersActive =
    filters.q ||
    filters.payment !== "all" ||
    filters.manager !== "all" ||
    filters.attention !== "all";
  const selectedHref = selected
    ? href({ client: selected.id }, "#client-detail")
    : base;
  return (
    <AdminPanelShell
      title="Clients"
      activeTab="clients"
      account={{ name: data.admin.name || "Admin", detail: data.admin.email }}
    >
      <div className="clients-workspace" aria-busy={busy}>
        <header className="clients-page-heading">
          <div>
            <h2>
              Clients <span>{summary.total}</span>
            </h2>
          </div>
          <button
            type="button"
            className="clients-button"
            onClick={() => void revalidator.revalidate()}
            disabled={busy}
          >
            <RefreshCw
              size={15}
              className={busy ? "clients-spin" : ""}
              aria-hidden="true"
            />
            {busy ? "Refreshing…" : "Refresh"}
          </button>
        </header>
        <Result data={result} />
        <>
            <Form
              key={`${filters.q}:${filters.payment}:${filters.manager}:${filters.attention}:${filters.sort}`}
              method="get"
              action={base}
              className="clients-filters"
              role="search"
              aria-label="Filter clients"
            >
              <div className="clients-search-row">
                <label className="clients-search">
                  <Search size={17} aria-hidden="true" />
                  <span className="sr-only">
                    Search clients by name, email, or country
                  </span>
                  <input
                    name="q"
                    type="search"
                    defaultValue={filters.q}
                    maxLength={120}
                    placeholder="Find a client…"
                  />
                </label>
                <Select
                  name="payment"
                  aria-label="Client payment filter"
                  defaultValue={filters.payment}
                >
                  <option value="all">All clients</option>
                  <option value="paid">Paid clients</option>
                  <option value="unpaid">Unpaid clients</option>
                  <option value="pending">Pending payment</option>
                  <option value="no-orders">No orders yet</option>
                </Select>
                <button
                  className="clients-button clients-button--primary"
                  type="submit"
                >
                  Search
                </button>
                {filtersActive ? (
                  <Link className="clients-button" to={base}>
                    Clear
                  </Link>
                ) : null}
              </div>
              <section
                className="clients-attention"
                aria-label="Client workflow filters"
              >
                {[
                  {
                    label: "Pending payment",
                    value: summary.pending,
                    to: `${base}?payment=pending`,
                    icon: CreditCard,
                  },
                  {
                    label: "Need a manager",
                    value: summary.needsManager,
                    to: `${base}?attention=needs-manager`,
                    icon: Users,
                    highlightWhenNonzero: true,
                  },
                  {
                    label: "Need an editor",
                    value: summary.needsEditor,
                    to: `${base}?attention=needs-editor`,
                    icon: FileVideo,
                    highlightWhenNonzero: true,
                  },
                  {
                    label: "Overdue work",
                    value: summary.overdue,
                    to: `${base}?attention=overdue`,
                    icon: TriangleAlert,
                  },
                ].map(
                  ({
                    label,
                    value,
                    to,
                    icon: Icon,
                    highlightWhenNonzero,
                  }) => (
                    <Link
                      key={label}
                      to={to}
                      className="clients-attention-item"
                    >
                      <Icon size={17} aria-hidden="true" />
                      <span>{label}</span>
                      <strong
                        className={
                          highlightWhenNonzero && value > 0
                            ? "clients-attention-count--alert"
                            : undefined
                        }
                      >
                        {value}
                      </strong>
                    </Link>
                  ),
                )}
              </section>
              <details
                className="clients-advanced-filters"
                open={
                  filters.manager !== "all" ||
                  filters.attention !== "all" ||
                  filters.sort !== "attention" ||
                  undefined
                }
              >
                <summary>
                  <SlidersHorizontal size={14} aria-hidden="true" />
                  More filters
                </summary>
                <div className="clients-filter-fields">
                  <label>
                    Manager
                    <Select name="manager" defaultValue={filters.manager}>
                      <option value="all">All managers</option>
                      <option value="unassigned">No active manager</option>
                      {managers.map((manager) => (
                        <option key={manager.id} value={manager.id}>
                          {manager.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    Work status
                    <Select name="attention" defaultValue={filters.attention}>
                      <option value="all">Any work status</option>
                      <option value="needs-manager">Needs manager</option>
                      <option value="needs-editor">Needs editor</option>
                      <option value="overdue">Overdue projects</option>
                      <option value="review">Ready for review</option>
                    </Select>
                  </label>
                  <label>
                    Sort
                    <Select name="sort" defaultValue={filters.sort}>
                      <option value="attention">Needs attention first</option>
                      <option value="recent">Recent activity</option>
                      <option value="name">Client name</option>
                    </Select>
                  </label>
                  <button type="submit" className="clients-button">
                    Apply filters
                  </button>
                </div>
              </details>
            </Form>
            <div className="clients-columns">
              <section
                className="clients-directory clients-panel"
                aria-labelledby="client-directory-title"
              >
                <header className="clients-panel-heading">
                  <h2 id="client-directory-title">Client directory</h2>
                  <span>
                    {directory.total} {filtersActive ? "matching" : "clients"}
                  </span>
                </header>
                {directory.clients.length ? (
                  <ul
                    className="clients-list"
                    tabIndex={0}
                    aria-label="Client results"
                  >
                    {directory.clients.map((client) => (
                      <li key={client.id}>
                        <Link
                          to={href(
                            {
                              client: client.id,
                              projectPage: null,
                              orderPage: null,
                              eventPage: null,
                              event: null,
                              status: null,
                            },
                            "#client-detail",
                          )}
                          className={`clients-row ${client.id === selected?.id ? "is-selected" : ""}`}
                          aria-current={
                            client.id === selected?.id ? "true" : undefined
                          }
                        >
                          <div className="clients-row-top">
                            <span className="clients-avatar" aria-hidden="true">
                              {initials(client.name || client.email)}
                            </span>
                            <span className="clients-row-identity">
                              <strong>{client.name || client.email}</strong>
                              <span>{client.email}</span>
                            </span>
                            {client.id === selected?.id ? (
                              <Check size={15} aria-hidden="true" />
                            ) : (
                              <ChevronRight size={15} aria-hidden="true" />
                            )}
                          </div>
                          <div className="clients-row-status">
                            <PaymentBadge client={client} />
                            {!client.active ? (
                              <span className="clients-badge clients-badge--muted">
                                Inactive
                              </span>
                            ) : null}
                            {client.pendingOrders + client.pendingInvoices >
                            0 ? (
                              <span className="clients-badge clients-badge--amber">
                                {client.pendingOrders + client.pendingInvoices}{" "}
                                pending
                              </span>
                            ) : null}
                          </div>
                          <div className="clients-row-meta">
                            <span>
                              {client.activeProjects} active project
                              {client.activeProjects === 1 ? "" : "s"}
                            </span>
                            <span>
                              {client.managerActive
                                ? client.managerName || "Manager assigned"
                                : "No active manager"}
                            </span>
                          </div>
                          {client.overdueProjects ||
                          client.needsEditor ||
                          client.reviewProjects ? (
                            <div className="clients-row-alerts">
                              {client.overdueProjects > 0 ? (
                                <span>{client.overdueProjects} overdue</span>
                              ) : null}
                              {client.needsEditor > 0 ? (
                                <span>{client.needsEditor} need editor</span>
                              ) : null}
                              {client.reviewProjects > 0 ? (
                                <span>{client.reviewProjects} in review</span>
                              ) : null}
                            </div>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="clients-empty">
                    <UserRound size={26} aria-hidden="true" />
                    <h3>No matching clients</h3>
                    <p>Try a different name, manager, or payment filter.</p>
                    <Link className="clients-button" to={base}>
                      Clear filters
                    </Link>
                  </div>
                )}
                <Pagination
                  page={directory.page}
                  total={directory.total}
                  size={20}
                  label="client directory"
                  to={(page) =>
                    href({
                      page: String(page),
                      client: null,
                      projectPage: null,
                      orderPage: null,
                      eventPage: null,
                    })
                  }
                />
              </section>
              {selected && detail ? (
                <section
                  id="client-detail"
                  className="clients-detail clients-panel"
                  aria-labelledby="selected-client-title"
                >
                  <header className="clients-detail-heading">
                    <div className="clients-detail-identity">
                      <span
                        className="clients-avatar clients-avatar--large"
                        aria-hidden="true"
                      >
                        {initials(selected.name || selected.email)}
                      </span>
                      <div>
                        <h2 id="selected-client-title">
                          {selected.name || selected.email}
                        </h2>
                        <a href={`mailto:${selected.email}`}>
                          {selected.email}
                        </a>
                      </div>
                    </div>
                    <Link
                      className="clients-icon-button"
                      title="Open account details"
                      aria-label={`Open account details for ${selected.name || selected.email}`}
                      to={adminPath(
                        `/users/${selected.id}?returnTo=${encodeURIComponent(selectedHref)}`,
                      )}
                    >
                      <ExternalLink size={17} aria-hidden="true" />
                    </Link>
                  </header>
                  <details className="clients-contact">
                    <summary>
                      Contact & account details{" "}
                      <PaymentBadge client={selected} />
                    </summary>
                    <dl>
                      <div>
                        <dt>Account</dt>
                        <dd>{selected.active ? "Active" : "Inactive"}</dd>
                      </div>
                      <div>
                        <dt>Phone</dt>
                        <dd>{selected.phone || "Not provided"}</dd>
                      </div>
                      <div>
                        <dt>Country</dt>
                        <dd>{selected.country || "Not provided"}</dd>
                      </div>
                      <div>
                        <dt>Joined</dt>
                        <dd>{date(selected.createdAt)}</dd>
                      </div>
                      <div>
                        <dt>Latest work update</dt>
                        <dd>{date(selected.lastActivity, true)}</dd>
                      </div>
                    </dl>
                  </details>
                  <ManagerAssignment
                    key={`${selected.id}:${selected.managerId}`}
                    client={selected}
                    managers={managers}
                  />
                  <div className="clients-client-metrics">
                    <div>
                      <strong>{selected.activeProjects}</strong>
                      <span>Active projects</span>
                    </div>
                    <div>
                      <strong>{selected.reviewProjects}</strong>
                      <span>In review</span>
                    </div>
                    <div>
                      <strong>{selected.unresolvedFeedback}</strong>
                      <span>Open feedback</span>
                    </div>
                    <div>
                      <strong>
                        {selected.pendingOrders + selected.pendingInvoices}
                      </strong>
                      <span>Pending payments</span>
                    </div>
                  </div>
                  {selected.overdueProjects > 0 ? (
                    <p className="clients-inline-alert">
                      <TriangleAlert size={15} aria-hidden="true" />
                      {selected.overdueProjects} project
                      {selected.overdueProjects === 1 ? " is" : "s are"} past
                      the target delivery date.
                    </p>
                  ) : null}
                  <nav
                    className="clients-detail-tabs"
                    aria-label="Client detail views"
                  >
                    {[
                      {
                        id: "projects",
                        label: "Projects",
                        count: selected.projectCount,
                      },
                      {
                        id: "orders",
                        label: "Orders",
                        count: selected.orderCount,
                      },
                      {
                        id: "activity",
                        label: "Activity",
                        count: detail.eventCount,
                      },
                      {
                        id: "conversations",
                        label: "Conversations",
                        count: conversations.rooms.length,
                      },
                    ].map((tab) => (
                      <Link
                        key={tab.id}
                        to={href(
                          { client: selected.id, section: tab.id },
                          "#client-detail",
                        )}
                        aria-current={section === tab.id ? "page" : undefined}
                      >
                        {tab.label}
                        <span>
                          {tab.count}
                          {tab.id === "conversations" && conversations.hasMore
                            ? "+"
                            : ""}
                        </span>
                      </Link>
                    ))}
                  </nav>
                  <div className="clients-detail-content">
                    {section === "projects" ? (
                      <>
                        <div className="clients-section-heading">
                          <h3>Project assignments</h3>
                          <div className="clients-section-actions">
                            <Link to={adminPath("?tab=projects")}>
                              Billing & status
                            </Link>
                            {room ? (
                              <Link to={adminPath(`/chat?room=${room.id}`)}>
                                <MessageSquare size={14} aria-hidden="true" />
                                Client chat
                                {room.unreadCount
                                  ? ` (${room.unreadCount})`
                                  : ""}
                              </Link>
                            ) : null}
                          </div>
                        </div>
                        {detail.projects.length ? (
                          <ul className="clients-projects">
                            {detail.projects.map((project) => (
                              <li key={project.id}>
                                <div className="clients-project-title">
                                  <Link
                                    to={adminPath(`/projects/${project.id}`)}
                                  >
                                    {project.title}
                                    <ArrowRight size={14} aria-hidden="true" />
                                  </Link>
                                  <span
                                    className={`clients-badge ${["review", "client_review"].includes(project.status) ? "clients-badge--violet" : "clients-badge--muted"}`}
                                  >
                                    {projectStatusLabel(project.status)}
                                  </span>
                                </div>
                                <p className="clients-project-meta">
                                  <span>
                                    Delivery: {date(project.deadline)}
                                  </span>
                                  <span>
                                    Billing:{" "}
                                    {billingLabels[project.billingStatus] ||
                                      project.billingStatus.replaceAll(
                                        "_",
                                        " ",
                                      )}
                                  </span>
                                  {project.unresolvedFeedback > 0 ? (
                                    <span>
                                      {project.unresolvedFeedback} open feedback
                                    </span>
                                  ) : null}
                                </p>
                                <EditorAssignment
                                  key={`${project.id}:${project.reviewRevision}`}
                                  project={project}
                                  client={selected}
                                  editors={editors}
                                />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="clients-empty">
                            <FileVideo size={25} aria-hidden="true" />
                            <h3>No projects yet</h3>
                            <p>
                              Projects will appear when this client submits a
                              brief. You can assign their manager now.
                            </p>
                          </div>
                        )}
                        {!editors.length ? (
                          <p className="clients-help">
                            No active editors. Add an editor account in Role
                            manager.
                          </p>
                        ) : null}
                        <Pagination
                          page={detail.projectPage}
                          total={selected.projectCount}
                          size={CLIENT_DETAIL_PAGE_SIZE}
                          label="projects"
                          to={(page) =>
                            href(
                              {
                                client: selected.id,
                                projectPage: String(page),
                              },
                              "#client-detail",
                            )
                          }
                        />
                        <p className="clients-help">
                          Editors are assigned per project. Saving a new editor
                          replaces the previous editor's access.
                        </p>
                      </>
                    ) : section === "orders" ? (
                      data.orders ? (
                        <AdminOrdersWorkspace data={data.orders} totals={detail.paidTotals} now={data.generatedAt} />
                      ) : null
                    ) : section === "activity" ? (
                      <>
                        <div className="clients-section-heading">
                          <h3>Client activity</h3>
                          <span>Times in UTC</span>
                        </div>
                        <ol className="clients-timeline">
                          {detail.events.map((event) => (
                            <li key={event.id}>
                              <span
                                className={`clients-event-icon clients-event-icon--${event.kind}`}
                              >
                                <EventIcon kind={event.kind} />
                              </span>
                              <div>
                                <Link to={eventTo(event, selected.id)}>
                                  {event.title}
                                </Link>
                                <p>{event.detail}</p>
                                <time dateTime={event.at}>
                                  {date(event.at, true)}
                                </time>
                              </div>
                            </li>
                          ))}
                        </ol>
                        <Pagination
                          page={detail.eventPage}
                          total={detail.eventCount}
                          size={CLIENT_EVENT_PAGE_SIZE}
                          label="activity"
                          to={(page) =>
                            href(
                              { client: selected.id, eventPage: String(page) },
                              "#client-detail",
                            )
                          }
                        />
                        <p className="clients-help">
                          Recorded account, order, project, review, file, quote,
                          and enquiry activity. Assignments and project statuses
                          show their latest recorded change.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="clients-section-heading">
                          <h3>Chat & support</h3>
                          <span>Recent conversations</span>
                        </div>
                        {data.chatUnavailable ? (
                          <p className="clients-inline-alert" role="status">
                            Conversation data is temporarily unavailable.
                            Refresh to retry.
                          </p>
                        ) : null}
                        {conversations.rooms.length ? (
                          <ul className="clients-conversations">
                            {conversations.rooms.map((conversation) => (
                              <li key={conversation.id}>
                                <Link
                                  to={adminPath(
                                    `/${conversation.kind === "support" ? "tickets" : "chat"}?room=${conversation.id}`,
                                  )}
                                >
                                  <MessageSquare size={17} aria-hidden="true" />
                                  <div>
                                    <strong>
                                      {conversation.ticket
                                        ? `#${conversation.ticket.number} ${conversation.ticket.subject}`
                                        : "Client project group"}
                                    </strong>
                                    <p>
                                      {conversation.lastMessagePreview ||
                                        "No messages yet"}
                                    </p>
                                    <span>
                                      {conversation.ticket
                                        ? conversation.ticket.status.replaceAll(
                                            "_",
                                            " ",
                                          )
                                        : "Project conversation"}{" "}
                                      · {date(conversation.updatedAt, true)} UTC
                                    </span>
                                  </div>
                                  {conversation.unreadCount ? (
                                    <span className="clients-badge clients-badge--violet">
                                      {conversation.unreadCount} unread
                                    </span>
                                  ) : (
                                    <ChevronRight
                                      size={16}
                                      aria-hidden="true"
                                    />
                                  )}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : !data.chatUnavailable ? (
                          <div className="clients-empty">
                            <MessageSquare size={25} aria-hidden="true" />
                            <h3>No conversations yet</h3>
                            <p>
                              Project chat opens after a paid package order.
                              Support conversations appear when the client
                              starts one.
                            </p>
                          </div>
                        ) : null}
                        {conversations.hasMore ? (
                          <p className="clients-help">
                            Showing the latest 20 conversations. Open Support
                            tickets for older conversations.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                </section>
              ) : (
                <section className="clients-detail clients-panel clients-empty">
                  <Users size={30} aria-hidden="true" />
                  <h2>Select a client</h2>
                  <p>
                    Choose a client to manage assignments and follow their work.
                  </p>
                </section>
              )}
            </div>
        </>
        <p className="clients-updated">
          <Check size={13} aria-hidden="true" />
          Updated {date(data.generatedAt, true)} UTC
        </p>
      </div>
    </AdminPanelShell>
  );
}
