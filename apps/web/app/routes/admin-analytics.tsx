import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { Await, data, Link, useLoaderData, useNavigation, useRevalidator, useSearchParams } from "react-router";
import { Suspense, useEffect, useRef, useState } from "react";
import { AdminPanelShell } from "../components/AdminPanelShell";
import { AnalyticsDashboard } from "../components/admin/AnalyticsDashboard";
import { AnalyticsReportPeriodControl } from "../components/admin/AnalyticsReportPeriodControl";
import { getDbFromContext } from "../lib/db.server";
import { adminPath } from "../lib/admin-paths";
import { toPublicAdminUser } from "../lib/admin-public";
import { commitAdminSession, getAdminSession, requireAdminUser } from "../lib/session.server";
import { getCloudflareAnalyticsDashboard } from "../lib/provider-usage.server";
import { getSiteEngagedSessionsSnapshot, getSiteInteractionSnapshot } from "../lib/site-analytics.server";
import { formatSiteAnalyticsReportRange, getSiteAnalyticsReportRange, SITE_ANALYTICS_REPORT_PERIODS, type SiteAnalyticsReportPeriod } from "../lib/site-analytics-report";

export const meta: MetaFunction = () => [
  { title: "Analytics - EdiCut Admin" },
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
  const report = getSiteAnalyticsReportRange(new URL(request.url).searchParams.get("period"));
  const analytics = getCloudflareAnalyticsDashboard(context).catch((error) => {
    console.error("Cloudflare traffic analytics error:", error);
    return { status: "unavailable" as const };
  });
  // Commit the range and its on-site totals together, so navigation never labels stale totals as a new period.
  const [interactions, engagedSessions] = await Promise.all([
    getSiteInteractionSnapshot(db, report).catch(() => ({ status: "not-configured" as const, items: [] })),
    getSiteEngagedSessionsSnapshot(db, report).catch(() => ({ status: "not-configured" as const, daily: [] })),
  ]);
  const adminSession = await getAdminSession(request.headers.get("Cookie"), context);

  return data({
    adminUser: toPublicAdminUser(adminUser),
    analytics,
    interactions,
    engagedSessions,
    report,
  }, {
    headers: {
      "Set-Cookie": await commitAdminSession(adminSession, { maxAge: 60 * 60 * 2 }, context),
    },
  });
}

function AnalyticsLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading analytics">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="neo-workspace__panel h-32 animate-pulse rounded-[18px] bg-white/60" />)}
      </div>
      <div className="neo-workspace__panel h-72 animate-pulse rounded-[22px] bg-white/60" />
    </div>
  );
}

export default function AdminAnalyticsRoute() {
  const { adminUser, analytics, interactions, engagedSessions, report } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigation = useNavigation();
  const pendingPeriod = navigation.state !== "idle" && navigation.location?.pathname === adminPath("/analytics")
    ? getSiteAnalyticsReportRange(new URLSearchParams(navigation.location.search).get("period")).period
    : undefined;
  const changePeriod = (period: SiteAnalyticsReportPeriod) => {
    const next = new URLSearchParams(searchParams);
    next.set("period", period);
    setSearchParams(next, { preventScrollReset: true });
  };
  const revalidator = useRevalidator();
  const revalidatorRef = useRef(revalidator);
  const navigationStateRef = useRef(navigation.state);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  revalidatorRef.current = revalidator;
  navigationStateRef.current = navigation.state;

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (revalidatorRef.current.state === "idle" && navigationStateRef.current === "idle") revalidatorRef.current.revalidate();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (revalidator.state === "idle") setLastUpdated(new Date());
  }, [revalidator.state, report.period, report.startDay, report.endDay]);

  return (
    <AdminPanelShell
      title="Analytics"
      activeTab="analytics"
      account={{ name: adminUser.name || "Admin", detail: adminUser.email }}
      headerActions={(
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => revalidator.revalidate()}
            disabled={revalidator.state !== "idle" || navigation.state !== "idle"}
            aria-busy={revalidator.state !== "idle" || navigation.state !== "idle"}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-[#d5dee8] bg-white/80 px-4 text-xs font-black text-[#425365] transition hover:bg-white disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">refresh</span>
            {revalidator.state === "idle" && navigation.state === "idle" ? "Refresh" : "Updating"}
          </button>
          <Link to={adminPath()} className="hidden h-10 items-center gap-2 rounded-full bg-[#6d55e8] px-4 text-xs font-black text-white shadow-[0_7px_18px_rgba(109,85,232,0.22)] transition hover:bg-[#5b44d3] md:inline-flex">
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">dashboard_customize</span>
            Dashboard
          </Link>
        </div>
      )}
    >
      <section className="mb-6" aria-labelledby="admin-analytics-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="neo-workspace__eyebrow">Cloudflare + on-site analytics</p>
            <h1 id="admin-analytics-heading" className="neo-workspace__title mt-1">Traffic analytics</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#687583]">
              Visitors, pages, origins, automated traffic, and consent-based interaction areas.
            </p>
          </div>
          <p className="text-[10px] font-bold text-[#7b8995]" aria-live="polite">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · refreshes every minute` : "Updating every minute"}
          </p>
        </div>
      </section>

      <section className="neo-workspace__panel mb-5 flex flex-wrap items-center justify-between gap-4 rounded-[22px] p-4 sm:p-5" aria-label="On-site report settings">
        <div>
          <h2 className="text-sm font-black text-[#172838]">On-site reports · {report.description.toLowerCase()}</h2>
          <p className="mt-1 text-xs leading-5 text-[#526579]">{formatSiteAnalyticsReportRange(report)}</p>
          <p className="mt-1 text-[11px] leading-5 text-[#687583]">Human-session estimates, lead signals, and interaction areas. Today is still in progress.</p>
        </div>
        <div className="min-w-0">
          <AnalyticsReportPeriodControl period={report.period} pendingPeriod={pendingPeriod} onPeriodChange={changePeriod} />
          <p className="mt-1 min-h-5 text-[11px] text-[#687583]" role="status" aria-live="polite">
            {pendingPeriod ? `Loading ${SITE_ANALYTICS_REPORT_PERIODS.find((item) => item.id === pendingPeriod)?.label.toLowerCase()} report…` : "Daily = today · weekly = 7 days · monthly = 30 days"}
          </p>
        </div>
      </section>

      <Suspense fallback={<AnalyticsLoading />}>
        <Await resolve={analytics} errorElement={<p role="status" className="rounded-xl border border-[#e0e7ee] bg-white p-5 text-sm text-[#687583]">Analytics could not be loaded.</p>}>
          {(snapshot) => <AnalyticsDashboard snapshot={snapshot} interactions={interactions} engagedSessions={engagedSessions} report={report} pendingPeriod={pendingPeriod} onPeriodChange={changePeriod} />}
        </Await>
      </Suspense>
    </AdminPanelShell>
  );
}
