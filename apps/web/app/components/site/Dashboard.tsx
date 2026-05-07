const metricData = [
  ["Active projects", "8", "+2 this week"],
  ["Pending reviews", "3", "2 due today"],
  ["Files uploaded", "126", "42GB processed"],
  ["Next delivery", "18h", "Medium package"],
];

const pipeline = [
  ["Intake", "Podcast repurpose", "Due May 7"],
  ["Editing", "Product review", "Due May 8"],
  ["Review", "Creator vlog", "2 comments"],
  ["Approved", "Shorts batch", "Ready"],
];

export function AppShell({ mode }: { mode: "creator" | "admin" }) {
  const isAdmin = mode === "admin";
  const nav = isAdmin
    ? ["Overview", "Customers", "Projects", "Editors", "Packages", "Payments", "Messages", "Settings"]
    : ["Overview", "Projects", "Uploads", "Reviews", "Messages", "Billing", "Settings"];

  return (
    <div className="min-h-screen bg-secondary text-foreground">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 bg-white p-4 lg:block">
        <div className="flex items-center gap-2 text-lg font-black">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
            <span className="material-symbols-outlined text-[20px]">play_arrow</span>
          </span>
          EdiCut {isAdmin ? "Admin" : ""}
        </div>
        <nav className="mt-8 grid gap-1">
          {nav.map((item, index) => (
            <a key={item} href="#" className={`rounded-lg px-3 py-2 text-sm font-bold ${index === 0 ? "bg-secondary text-foreground" : "text-muted-foreground secondary"}`}>{item}</a>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <input placeholder="Search projects, files, customers" className="h-10 w-full max-w-md rounded-lg border border-gray-200 px-3 text-sm font-medium outline-none" />
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-black text-white">{isAdmin ? "Create project" : "New project"}</button>
          </div>
        </header>
        <main className="p-4 lg:p-6">
          {isAdmin ? <AdminDashboard /> : <CreatorDashboard />}
        </main>
      </div>
    </div>
  );
}

function MetricRow({ admin = false }: { admin?: boolean }) {
  const data = admin
    ? [["Open projects", "42", "9 in review"], ["Overdue reviews", "6", "Needs action"], ["Monthly revenue", "$28.4K", "+14%"], ["Editor capacity", "78%", "Healthy"]]
    : metricData;
  return (
    <div className="grid gap-3 md:grid-cols-4">
      {data.map(([label, value, hint]) => (
        <article key={label} className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-black">{value}</p>
          <p className="mt-1 text-xs font-bold text-muted-foreground">{hint}</p>
        </article>
      ))}
    </div>
  );
}

function CreatorDashboard() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Creator dashboard</h1>
          <p className="text-sm font-bold text-muted-foreground">All Channels · Last 30 Days</p>
        </div>
        <div className="flex gap-2 text-xs font-black"><span className="rounded bg-white px-3 py-2">All channels</span><span className="rounded bg-white px-3 py-2">Last 30 days</span></div>
      </div>
      <MetricRow />
      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <PipelineBoard />
        <ReviewPanel />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_0.75fr]">
        <Deliverables />
        <ActivityFeed />
      </div>
    </div>
  );
}

function PipelineBoard() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-black">Project pipeline</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {pipeline.map(([column, title, due]) => (
          <div key={column} className="rounded-lg bg-secondary p-3">
            <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">{column}</p>
            <article className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <h3 className="text-sm font-black">{title}</h3>
              <p className="mt-2 text-xs font-bold text-muted-foreground">{due}</p>
            </article>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewPanel() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-black">Current review</h2>
      <div className="mt-4 aspect-video rounded-lg border border-gray-200 bg-foreground" />
      <div className="mt-3 h-2 rounded-full bg-secondary"><div className="h-2 w-2/3 rounded-full bg-primary" /></div>
      <div className="mt-4 grid gap-2 text-sm">
        {["Tighten intro hook at 0:08", "Add caption emphasis at 2:14", "Export Shorts crop after approval"].map((item) => <p key={item} className="rounded-lg bg-secondary p-3 font-bold text-slate-800">{item}</p>)}
      </div>
      <div className="mt-4 flex gap-2"><button className="rounded-lg bg-primary px-4 py-2 text-sm font-black text-white">Approve</button><button className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-black">Request revision</button></div>
    </section>
  );
}

function Deliverables() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-black">Upload queue and deliverables</h2>
      {["Long-form edit", "Shorts batch", "Thumbnail pack", "Captions"].map((item, index) => (
        <div key={item} className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-bold">
          <span>{item}</span><span className="rounded bg-secondary px-2 py-1 text-xs text-muted-foreground">{index === 0 ? "Ready" : index === 1 ? "In progress" : "Draft"}</span>
        </div>
      ))}
    </section>
  );
}

function ActivityFeed() {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-black">Activity</h2>
      {["Editor uploaded first cut", "Project manager tagged two notes", "Payment receipt approved"].map((item) => <p key={item} className="mt-3 text-sm font-bold text-muted-foreground">{item}</p>)}
    </section>
  );
}

function AdminDashboard() {
  return (
    <div className="grid gap-4">
      <div><h1 className="text-2xl font-black">Admin operations</h1><p className="text-sm font-bold text-muted-foreground">Projects, editors, payments, and support at a glance.</p></div>
      <MetricRow admin />
      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
        <OperationsTable />
        <div className="grid gap-4"><WorkloadPanel /><PaymentQueue /><PackagePanel /></div>
      </div>
      <ActivityFeed />
    </div>
  );
}

function OperationsTable() {
  const rows = [["Sarah Jenkins", "Medium", "Maya", "Review", "May 7", "High"], ["Mike Ross", "Pro", "Ari", "Editing", "May 8", "Med"], ["Elena Studio", "Basic", "Noah", "Intake", "May 9", "Low"]];
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 p-4 font-black">Operations table</div>
      <div className="grid grid-cols-6 gap-2 bg-secondary p-3 text-xs font-black uppercase tracking-wide text-muted-foreground">
        {["Customer", "Package", "Editor", "Status", "Due", "Priority"].map((h) => <span key={h}>{h}</span>)}
      </div>
      {rows.map((row) => <div key={row[0]} className="grid grid-cols-6 gap-2 border-t border-gray-100 p-3 text-sm font-bold">{row.map((cell) => <span key={cell}>{cell}</span>)}</div>)}
    </section>
  );
}

function WorkloadPanel() {
  return <MiniPanel title="Editor workload" items={["Maya · 6 active · 80%", "Ari · 4 active · 62%", "Noah · 3 active · 48%"]} />;
}

function PaymentQueue() {
  return <MiniPanel title="Payment queue" items={["3 pending receipts", "12 approved this week", "$4.2K awaiting review"]} />;
}

function PackagePanel() {
  return <MiniPanel title="Package management" items={["Basic · edit", "Medium · edit", "Pro · edit"]} />;
}

function MiniPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="font-black">{title}</h2>
      {items.map((item) => <p key={item} className="mt-3 rounded-lg bg-secondary p-3 text-sm font-bold text-slate-800">{item}</p>)}
    </section>
  );
}
