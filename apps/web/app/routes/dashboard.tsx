import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Link, Form, redirect, useLoaderData } from "react-router";
import { requireUserId, getSession, destroySession } from "../lib/session.server";
import { findUserById } from "@edicut/db/repositories/users";
import { getDbFromContext } from "../lib/db.server";

const navItems = [
  ["Home", "home", "/"],
  ["Overview", "space_dashboard", "/dashboard"],
  ["Projects", "video_library", "/dashboard/projects"],
  ["Reviews", "rate_review", "/dashboard/reviews"],
  ["Uploads", "upload_file", "/dashboard/uploads"],
  ["Messages", "forum", "/dashboard/messages"],
  ["Billing", "receipt_long", "/dashboard/billing"],
  ["Affiliates", "hub", "/dashboard/affiliates"],
  ["Settings", "settings", "/dashboard/settings"],
];

const kpis = [
  ["Active projects", "8", "+2 this week", "movie"],
  ["Reviews due", "3", "2 need client approval", "task_alt"],
  ["Delivery health", "94%", "All priority orders covered", "monitoring"],
  ["Affiliate revenue", "$4.8K", "12 approved referrals", "payments"],
];

const roleCards = [
  {
    title: "Client Studio",
    icon: "account_circle",
    stat: "3 approvals",
    copy: "Review cuts, upload missing files, confirm briefs, and collect final exports.",
    rows: ["Product review waits for notes", "Shorts batch is 68% complete", "Receipt verified for Pro package"],
  },
  {
    title: "Editor Manager",
    icon: "supervisor_account",
    stat: "6 risks",
    copy: "Balance editor capacity, assign work, track QA, and unblock client communication.",
    rows: ["Maya at 82% capacity", "2 projects need manager QA", "1 overdue intake brief"],
  },
  {
    title: "Affiliate Hub",
    icon: "campaign",
    stat: "$920 pending",
    copy: "Track clicks, signups, paid clients, campaign codes, and upcoming payouts.",
    rows: ["18 new clicks today", "4 signups from creator bundle", "Next payout opens May 15"],
  },
];

const pipeline = [
  ["Intake", "4", "Briefs and raw files"],
  ["Editing", "9", "Cuts in progress"],
  ["Quality check", "5", "Manager review"],
  ["Client review", "3", "Awaiting notes"],
  ["Delivered", "12", "This month"],
];

const actions = [
  ["Approve first cut", "Product review", "Client", "Due today", "High"],
  ["Assign editor", "Podcast repurpose", "Manager", "2h left", "High"],
  ["Upload reference files", "Creator vlog", "Client", "Tomorrow", "Medium"],
  ["Review payout", "April referrals", "Affiliate", "May 15", "Medium"],
];

const projects = [
  ["Nadia Creates", "Pro", "Maya", "Client review", "May 7", "High", "Approve"],
  ["Apex Drive", "Medium", "Ari", "Editing", "May 8", "Medium", "QA check"],
  ["Skinmynt", "Basic", "Noah", "Intake", "May 9", "Low", "Need files"],
  ["Neon Pulse", "Pro", "Maya", "Delivered", "May 4", "Done", "Download"],
];

const activity = [
  ["First cut uploaded", "Nadia Creates", "12m ago"],
  ["Manager tagged a hook revision", "Apex Drive", "38m ago"],
  ["Affiliate signup converted", "Creator bundle", "2h ago"],
  ["Receipt approved", "Skinmynt", "Yesterday"],
];

export async function action({ request, context }: ActionFunctionArgs) {
  const formData = await request.formData();
  if (formData.get("intent") === "logout") {
    const session = await getSession(request.headers.get("Cookie"), context);
    return redirect("/signin", {
      headers: {
        "Set-Cookie": await destroySession(session, context),
      },
    });
  }
  return null;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const userId = await requireUserId(request, context);
  const db = getDbFromContext(context);

  const user = await findUserById(db, userId);

  if (!user) {
    // If user deleted from DB but session exists, force sign in
    const session = await getSession(request.headers.get("Cookie"), context);
    throw redirect("/signin", {
      headers: {
        "Set-Cookie": await destroySession(session, context),
      },
    });
  }

  return { user };
}

export default function DashboardRoute() {
  const { user } = useLoaderData<typeof loader>();
  const displayName = user.name || user.email;
  const roleLabel = normalizeRole(user.role);

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
            {navItems.map(([label, icon, path]) => (
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
            <p className="mt-1 text-xs font-bold text-muted-foreground">{roleLabel}</p>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs font-black uppercase text-muted-foreground">Welcome back</p>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{displayName}</h1>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative min-w-0 sm:w-80">
                <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-muted-foreground">
                  search
                </span>
                <input
                  placeholder="Search projects, clients, files, referrals"
                  className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-10 pr-3 text-sm font-medium outline-none focus:border-foreground"
                />
              </label>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white shadow-lg shadow-red-500/15 [#D90000]">
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
                New project
              </button>
              <Form method="post">
                <input type="hidden" name="intent" value="logout" />
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-black foreground"
                >
                  <span className="material-symbols-outlined text-[20px]">logout</span>
                  Sign out
                </button>
              </Form>
            </div>
          </div>
          <nav className="mx-auto mt-3 flex max-w-[1500px] gap-2 overflow-x-auto pb-1 lg:hidden">
            {navItems.slice(0, 6).map(([label, icon, path]) => (
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

        <main className="mx-auto grid max-w-[1500px] gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="grid gap-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {kpis.map(([label, value, hint, icon]) => (
                <MetricCard key={label} label={label} value={value} hint={hint} icon={icon} />
              ))}
            </div>

            <section>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <p className="text-xs font-black uppercase text-muted-foreground">Role cockpit</p>
                  <h2 className="mt-1 text-xl font-black">Workspaces for clients, managers, and affiliates</h2>
                </div>
                <div className="inline-flex rounded-lg border border-gray-200 bg-secondary p-1 text-xs font-black">
                  {["Today", "7 days", "30 days"].map((item, index) => (
                    <button
                      key={item}
                      className={`rounded-md px-3 py-1.5 ${index === 0 ? "bg-white text-foreground shadow-sm" : "text-muted-foreground"}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-3 xl:grid-cols-3">
                {roleCards.map((card) => (
                  <RoleCard key={card.title} {...card} />
                ))}
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <PipelinePanel />
              <ActionQueue />
            </div>

            <ProjectTable />
          </section>

          <aside className="grid content-start gap-5">
            <ContextPanel
              title="Package and billing"
              icon="workspace_premium"
              items={["Pro package active", "$1,240 approved this month", "2 invoices awaiting receipts"]}
            />
            <ContextPanel
              title="Affiliate snapshot"
              icon="conversion_path"
              items={["1,842 clicks", "37 signups", "$920 pending payout"]}
            />
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-black">Recent activity</h2>
                <span className="material-symbols-outlined text-[20px] text-muted-foreground">history</span>
              </div>
              <div className="mt-4 grid gap-4">
                {activity.map(([event, subject, time]) => (
                  <div key={`${event}-${subject}`} className="border-l-2 border-primary pl-3">
                    <p className="text-sm font-black">{event}</p>
                    <p className="mt-1 text-xs font-bold text-muted-foreground">{subject} - {time}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-gray-200 bg-foreground p-4 text-white shadow-sm">
              <p className="text-xs font-black uppercase text-white/60">Next best action</p>
              <h2 className="mt-2 text-xl font-black">Clear the client review queue</h2>
              <p className="mt-2 text-sm font-medium text-white/70">
                Three approvals unlock five exports and free two editor slots for new client work.
              </p>
              <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-black text-foreground">
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
                Open reviews
              </button>
            </section>
          </aside>
        </main>
      </div>
    </div>
  );
}

function normalizeRole(role: string) {
  const labels: Record<string, string> = {
    admin: "Administrator",
    manager: "Editor manager",
    project_manager: "Editor manager",
    editor: "Editor",
    affiliate: "Affiliate marketer",
    client: "Client",
    user: "Client",
  };

  return labels[role] ?? role.replace(/[_-]/g, " ");
}

function MetricCard({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) {
  return (
    <article className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
        </div>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF0F0] text-primary">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </span>
      </div>
      <p className="mt-3 text-xs font-bold text-muted-foreground">{hint}</p>
    </article>
  );
}

function RoleCard({
  title,
  icon,
  stat,
  copy,
  rows,
}: {
  title: string;
  icon: string;
  stat: string;
  copy: string;
  rows: string[];
}) {
  return (
    <article className="rounded-lg border border-gray-200 bg-secondary p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-foreground shadow-sm">
            <span className="material-symbols-outlined text-[21px]">{icon}</span>
          </span>
          <h3 className="font-black">{title}</h3>
        </div>
        <span className="rounded-md bg-foreground px-2.5 py-1 text-xs font-black text-white">{stat}</span>
      </div>
      <p className="mt-3 text-sm font-medium leading-6 text-[#575757]">{copy}</p>
      <div className="mt-4 grid gap-2">
        {rows.map((row) => (
          <p key={row} className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            {row}
          </p>
        ))}
      </div>
    </article>
  );
}

function PipelinePanel() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-black">Production pipeline</h2>
        <span className="text-xs font-black uppercase text-muted-foreground">24 open</span>
      </div>
      <div className="mt-4 grid gap-3">
        {pipeline.map(([stage, count, hint], index) => (
          <div key={stage}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black">{stage}</p>
                <p className="text-xs font-bold text-muted-foreground">{hint}</p>
              </div>
              <p className="text-sm font-black">{count}</p>
            </div>
            <div className="h-2 rounded-full bg-[#F1F1F1]">
              <div
                className="h-2 rounded-full bg-primary"
                style={{ width: `${Math.max(22, 88 - index * 13)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionQueue() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-black">Priority action queue</h2>
        <button className="text-xs font-black text-primary">View all</button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs font-black uppercase text-muted-foreground">
            <tr className="border-b border-gray-100">
              <th className="pb-3">Task</th>
              <th className="pb-3">Workspace</th>
              <th className="pb-3">Owner</th>
              <th className="pb-3">Due</th>
              <th className="pb-3">Priority</th>
            </tr>
          </thead>
          <tbody>
            {actions.map(([task, workspace, owner, due, priority]) => (
              <tr key={`${task}-${workspace}`} className="border-b border-gray-100 last:border-0">
                <td className="py-3 font-black">{task}</td>
                <td className="py-3 font-bold text-[#575757]">{workspace}</td>
                <td className="py-3 font-bold text-[#575757]">{owner}</td>
                <td className="py-3 font-bold text-[#575757]">{due}</td>
                <td className="py-3">
                  <StatusPill label={priority} tone={priority === "High" ? "red" : "dark"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ProjectTable() {
  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-3 border-b border-gray-100 p-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-black">Client project command center</h2>
          <p className="mt-1 text-sm font-bold text-muted-foreground">Owners, packages, deadlines, and next actions.</p>
        </div>
        <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-black">
          <span className="material-symbols-outlined text-[20px]">filter_list</span>
          Filter
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-secondary text-xs font-black uppercase text-muted-foreground">
            <tr>
              {["Client", "Package", "Editor", "Stage", "Due", "Risk", "Next action"].map((header) => (
                <th key={header} className="px-4 py-3">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((row) => (
              <tr key={row[0]} className="border-t border-gray-100">
                {row.map((cell, index) => (
                  <td key={`${row[0]}-${cell}`} className="px-4 py-4 font-bold text-[#575757]">
                    {index === 0 ? <span className="font-black text-foreground">{cell}</span> : index === 5 ? <StatusPill label={cell} tone={cell === "High" ? "red" : "dark"} /> : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContextPanel({ title, icon, items }: { title: string; icon: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-black">{title}</h2>
        <span className="material-symbols-outlined text-[20px] text-muted-foreground">{icon}</span>
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item) => (
          <div key={item} className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0">
            <p className="text-sm font-bold text-[#575757]">{item}</p>
            <span className="material-symbols-outlined text-[18px] text-muted-foreground">chevron_right</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "red" | "dark" }) {
  return (
    <span
      className={`inline-flex rounded-md px-2.5 py-1 text-xs font-black ${
        tone === "red" ? "bg-[#FFF0F0] text-primary" : "bg-[#F1F1F1] text-slate-800"
      }`}
    >
      {label}
    </span>
  );
}
