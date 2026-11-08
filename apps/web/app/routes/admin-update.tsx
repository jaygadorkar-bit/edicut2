import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";
import { ArrowUpRight, CalendarDays, Info, PackageCheck, Radio } from "lucide-react";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { getSoftwareUpdateStatus } from "../lib/admin-software-versions";
import { getAdminSoftwareVersionSnapshot } from "../lib/admin-software-versions.server";
import { toPublicAdminUser } from "../lib/admin-public";
import { getDbFromContext } from "../lib/db.server";
import { requireAdminUser } from "../lib/session.server";

export const meta: MetaFunction = () => [
  { title: "Update - EdiCut Admin" },
  { name: "robots", content: "noindex,nofollow" },
];

export function headers() {
  return {
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDbFromContext(context);
  const adminUser = await requireAdminUser(request, db, context, new URL(request.url).pathname);
  const snapshot = await getAdminSoftwareVersionSnapshot(db);

  return {
    adminUser: toPublicAdminUser(adminUser),
    ...snapshot,
  };
}

export default function AdminUpdateRoute() {
  const { adminUser, versions, checkedAt, automaticCount, totalCount } = useLoaderData<typeof loader>();
  const checkedDate = new Date(checkedAt).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <AdminPanelShell
      title="Update"
      activeTab="update"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
    >
      <div className="mx-auto w-full max-w-[1440px] pb-8">
        <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="neo-workspace__eyebrow">Software maintenance</p>
            <h1 className="neo-workspace__title mt-1">Update</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">
              Compare EdiCut’s installed versions with compatible releases. PostgreSQL is compared with the latest supported minor in its current major version.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#d5dee8] bg-white/75 px-3.5 py-2 text-xs font-semibold text-[#506171]">
              <CalendarDays size={15} aria-hidden="true" />
              <time dateTime={checkedAt}>Checked {checkedDate}</time>
            </span>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#cce8da] bg-[#f1fbf6] px-3.5 py-2 text-xs font-semibold text-[#26734d]">
              <Radio size={14} aria-hidden="true" />
              {automaticCount}/{totalCount} automatic
            </span>
          </div>
        </header>

        <aside className="mb-6 flex gap-3 rounded-2xl border border-[#ead6d9] bg-white/70 p-4 text-sm leading-6 text-[#586879] sm:p-5" aria-label="Manual version tracking">
          <Info size={19} className="mt-0.5 shrink-0 text-[#d51f2a]" aria-hidden="true" />
          <p>
            Public release sources are checked automatically and cached for up to six hours. The PostgreSQL version is read from the live database. This page reports updates but never applies them.
          </p>
        </aside>

        <section aria-label="Software versions" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {versions.map((software) => {
            const updateStatus = getSoftwareUpdateStatus(software);
            const updateStatusLabel = updateStatus === "out-of-date"
              ? "Out of date"
              : updateStatus === "up-to-date" ? "Up to date" : "Check unavailable";
            const updateStatusClass = updateStatus === "out-of-date"
              ? "bg-[#fff0f0] text-[#a91420]"
              : updateStatus === "up-to-date" ? "bg-[#edf8f2] text-[#26734d]" : "bg-[#f1f4f7] text-[#647383]";

            return (
              <article key={software.name} className="rounded-2xl border border-[#d9e2ec] bg-white/75 p-4 shadow-[0_10px_30px_rgba(28,44,61,0.04)] sm:p-5">
                <header className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e1e7ed] bg-[#f8fafc] text-[#536476]">
                      <PackageCheck size={19} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-[#172838]">{software.name}</h2>
                      <p className="mt-0.5 text-xs text-[#687583]">{software.category}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${software.latestStatus === "automatic" ? "bg-[#edf8f2] text-[#26734d]" : "bg-[#fff7e8] text-[#875d13]"}`}>
                      {software.latestStatus === "automatic" ? "Automatic" : "Saved reference"}
                    </span>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold ${updateStatusClass}`}>
                      {updateStatusLabel}
                    </span>
                  </div>
                </header>

                <dl className="mt-5 grid grid-cols-2 gap-3">
                  <div className="min-w-0 rounded-xl border border-[#e2e8ef] bg-[#f8fafc]/80 px-3 py-2.5">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#687583]">Current</dt>
                    <dd className="mt-1 break-words font-mono text-sm font-semibold text-[#172838]">{software.currentVersion}</dd>
                  </div>
                  <div className="min-w-0 rounded-xl border border-[#eedadd] bg-[#fffafb] px-3 py-2.5">
                    <dt className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#8b5960]">Latest</dt>
                    <dd className="mt-1 break-words font-mono text-sm font-semibold text-[#a91420]">{software.latestVersion}</dd>
                  </div>
                </dl>

                <a
                  href={software.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg text-xs font-bold text-[#a91420] underline-offset-4 transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a91420]"
                >
                  {software.sourceLabel}
                  <ArrowUpRight size={14} aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </article>
            );
          })}
        </section>
      </div>
    </AdminPanelShell>
  );
}
