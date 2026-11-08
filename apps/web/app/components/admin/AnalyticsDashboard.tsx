import { useState, type ReactNode } from "react";
import type { CloudflareAnalyticsDashboard } from "../../lib/provider-usage.server";
import type { SiteAcquisitionSnapshot, SiteEngagedSessionsSnapshot, SiteInteractionSnapshot } from "../../lib/site-analytics.server";
import { SITE_ANALYTICS_REGIONS, SITE_ANALYTICS_SOURCES } from "../../lib/site-analytics";
import { formatSiteAnalyticsReportRange, type SiteAnalyticsReportRange } from "../../lib/site-analytics-report";
import { AnalyticsReportPeriodControl, type AnalyticsReportPeriodControlProps } from "./AnalyticsReportPeriodControl";

type MetricPoint = { label: string; visitors: number; pageViews: number };

function number(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function axisNumber(value: number) {
  return value >= 1_000 ? compactNumber(value) : number(Math.round(value));
}

function metricValue(value: number | undefined) {
  return value === undefined ? "—" : number(value);
}

function AnalyticsMetric({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) {
  return (
    <article className="neo-workspace__stat-card h-full rounded-[17px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="neo-workspace__eyebrow">{label}</p>
          <p className="neo-workspace__stat-value mt-2">{value}</p>
        </div>
        <span className="neo-icon-badge neo-workspace__stat-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" aria-hidden="true">
          <span className="material-symbols-outlined text-[19px]">{icon}</span>
        </span>
      </div>
      <p className="neo-workspace__stat-hint mt-3">{hint}</p>
    </article>
  );
}

function makeLine(points: MetricPoint[], field: "visitors" | "pageViews") {
  const width = 720;
  const left = 46;
  const right = 12;
  const top = 14;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = 196 - top - bottom;
  const max = Math.max(1, ...points.map((point) => point[field]));
  return points.map((point, index) => {
    const x = left + (points.length <= 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth);
    const y = top + plotHeight - point[field] / max * plotHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function TrafficChart({ title, subtitle, points, labels }: {
  title: string;
  subtitle: string;
  points: MetricPoint[];
  labels: string[];
}) {
  const visitorLine = makeLine(points, "visitors");
  const pageViewLine = makeLine(points, "pageViews");
  const visitorMax = Math.max(1, ...points.map((point) => point.visitors));
  const pageViewMax = Math.max(1, ...points.map((point) => point.pageViews));
  const dateLabels = points.filter((_, index) => index === 0 || index === points.length - 1 || index % Math.max(1, Math.floor(points.length / 5)) === 0);

  return (
    <section className="neo-workspace__panel rounded-[22px] p-4 sm:p-5" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#172838] sm:text-lg">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#687583]">{subtitle} Each series has its own labeled scale.</p>
        </div>
        <div className="flex flex-wrap gap-3 text-[11px] font-bold text-[#516273]" aria-label="Chart legend">
          <span className="inline-flex items-center gap-1.5"><i className="block h-0 w-4 border-t-2 border-solid border-[#6955df]" aria-hidden="true" />Visitor IPs · left scale</span>
          <span className="inline-flex items-center gap-1.5"><i className="block h-0 w-4 border-t-2 border-dashed border-[#1aa89a]" aria-hidden="true" />Page views · right scale</span>
        </div>
      </div>
      {points.length ? (
        <div className="relative mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]" tabIndex={0} role="region" aria-label={`${title} chart, scroll horizontally`}>
          <svg className="h-auto min-w-[560px] w-full" viewBox="0 0 720 196" role="img" aria-label={`${title}: visitor IPs use the left scale and page views use the right scale`}>
            <title>{title}</title>
            <text x="46" y="10" fill="#6955df" fontSize="9" fontWeight="700">Visitor IPs</text>
            <text x="708" y="10" textAnchor="end" fill="#1aa89a" fontSize="9" fontWeight="700">Page views</text>
            {[0, 1, 2, 3].map((line) => {
              const y = 14 + line * 48;
              return <line key={line} x1="46" x2="708" y1={y} y2={y} stroke="#dbe4ed" strokeDasharray="3 5" />;
            })}
            <polyline points={visitorLine} fill="none" stroke="#6955df" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={pageViewLine} fill="none" stroke="#1aa89a" strokeWidth="2.5" strokeDasharray="6 4" strokeLinecap="round" strokeLinejoin="round" />
            {[0, 1, 2, 3].map((line) => {
              const y = 14 + line * 48;
              const fraction = 1 - line / 3;
              return (
                <g key={`scale-${line}`} fill="#778594" fontSize="9">
                  <text x="40" y={y + 3} textAnchor="end">{axisNumber(visitorMax * fraction)}</text>
                  <text x="716" y={y + 3} textAnchor="end">{axisNumber(pageViewMax * fraction)}</text>
                </g>
              );
            })}
            {points.map((point, index) => {
              const x = 46 + (points.length <= 1 ? 331 : index / (points.length - 1) * 662);
              const yVisitor = 14 + 146 - point.visitors / visitorMax * 146;
              const yPageView = 14 + 146 - point.pageViews / pageViewMax * 146;
              return (
                <g key={`${point.label}-${index}`}>
                  <circle cx={x} cy={yVisitor} r="2.5" fill="#6955df"><title>{`${labels[index]}: ${number(point.visitors)} visitor IPs`}</title></circle>
                  <rect x={x - 2} y={yPageView - 2} width="4" height="4" fill="#1aa89a"><title>{`${labels[index]}: ${number(point.pageViews)} page views`}</title></rect>
                </g>
              );
            })}
            {dateLabels.map((point) => {
              const index = points.indexOf(point);
              const x = 46 + (points.length <= 1 ? 331 : index / (points.length - 1) * 662);
              return <text key={`${point.label}-label`} x={x} y="190" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill="#778594" fontSize="10">{labels[index]}</text>;
            })}
          </svg>
          <div className="sr-only"><table>
            <caption>{title} data. Visitor IP estimates and page views for each interval.</caption>
            <thead><tr><th scope="col">Interval</th><th scope="col">Visitor IP estimates</th><th scope="col">Page views</th></tr></thead>
            <tbody>{points.map((point, index) => <tr key={`data-${point.label}`}><th scope="row">{labels[index]}</th><td>{number(point.visitors)}</td><td>{number(point.pageViews)}</td></tr>)}</tbody>
          </table></div>
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-[#d7e1eb] px-4 py-8 text-center text-sm text-[#687583]">No Cloudflare traffic in this time window.</p>
      )}
    </section>
  );
}

function countryName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

function RankList({ title, subtitle, rows, valueLabel, getValue, getCaption, emptyMessage, headerControl }: {
  title: string;
  subtitle: string;
  rows: Array<{ id: string; title: string; value: number; caption?: string }>;
  valueLabel: string;
  getValue?: (row: { id: string; title: string; value: number; caption?: string }) => number;
  getCaption?: (row: { id: string; title: string; value: number; caption?: string }) => string;
  emptyMessage?: string;
  headerControl?: ReactNode;
}) {
  const max = Math.max(1, ...rows.map((row) => getValue?.(row) ?? row.value));
  return (
    <section className="neo-workspace__panel min-w-0 rounded-[22px] p-4 sm:p-5" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#172838] sm:text-lg">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#687583]">{subtitle}</p>
        </div>
        {headerControl}
      </div>
      {rows.length ? (
        <ol className="mt-4 space-y-3">
          {rows.map((row) => {
            const value = getValue?.(row) ?? row.value;
            return (
              <li key={row.id}>
                <div className="flex min-w-0 items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-bold text-[#334456]" title={row.title}>{row.title}</p>
                    <p className="mt-0.5 truncate text-[10px] text-[#7b8995]">{getCaption?.(row) ?? row.caption ?? ""}</p>
                  </div>
                  <span className="shrink-0 font-black tabular-nums text-[#172838]">{number(value)}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e5ebf1]" aria-hidden="true">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#6955df] to-[#34ada0]" style={{ width: `${Math.max(2, value / max * 100)}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-[#d7e1eb] px-4 py-6 text-center text-xs text-[#687583]">{emptyMessage ?? "No data reported for this period."}</p>
      )}
      <p className="sr-only">Values are {valueLabel}.</p>
    </section>
  );
}

type CountryReportPeriod = "daily" | "weekly" | "monthly";
type AvailableAnalyticsSnapshot = Extract<CloudflareAnalyticsDashboard, { status: "available" }>;

function CountryReport({ snapshot }: { snapshot: AvailableAnalyticsSnapshot }) {
  const [period, setPeriod] = useState<CountryReportPeriod>("monthly");
  const periods: Array<{ id: CountryReportPeriod; label: string; description: string }> = [
    { id: "daily", label: "Daily", description: "Latest available UTC day" },
    { id: "weekly", label: "Weekly", description: "Latest 7 available UTC days" },
    { id: "monthly", label: "30 days", description: "Last 30 available UTC days" },
  ];
  const selectedPeriod = periods.find((option) => option.id === period)!;

  return (
    <RankList
      title="Where requests come from"
      subtitle={`${selectedPeriod.description} · Cloudflare edge estimate`}
      rows={snapshot.countryReports[period].map((row) => ({
        id: row.country,
        title: countryName(row.country),
        value: row.requests,
        caption: `${number(row.threats)} threat events`,
      }))}
      valueLabel="requests"
      emptyMessage="No country requests were reported for this period."
      headerControl={
        <div className="inline-flex shrink-0 gap-1 rounded-xl bg-[#f1f5f8] p-1" role="group" aria-label="Country report period">
          {periods.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={period === option.id}
              onClick={() => setPeriod(option.id)}
              className={`min-h-10 rounded-lg px-2.5 text-[11px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6955df] ${period === option.id ? "bg-white text-[#172838] shadow-sm" : "text-[#687583] hover:text-[#172838]"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    />
  );
}

function ProviderState({ status }: { status: CloudflareAnalyticsDashboard["status"] }) {
  const message = status === "permission-required"
    ? "The Cloudflare token needs Zone Analytics:Read for this zone."
    : status === "not-configured"
      ? "Add the server-side Cloudflare API token and zone ID to enable traffic analytics."
      : "Cloudflare analytics is temporarily unavailable. Try refreshing shortly.";
  return (
    <section className="neo-workspace__panel rounded-[22px] border border-[#f2d9a6] bg-[#fffaf0] p-5" role="status">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[#a56814]" aria-hidden="true">info</span>
        <div>
          <h2 className="text-sm font-black text-[#533b17]">Cloudflare data unavailable</h2>
          <p className="mt-1 text-sm leading-6 text-[#775e35]">{message}</p>
        </div>
      </div>
    </section>
  );
}

function EngagedSessionsMetric({ snapshot, report }: { snapshot: SiteEngagedSessionsSnapshot; report: SiteAnalyticsReportRange }) {
  const sessions = snapshot.daily.reduce((sum, point) => sum + point.sessions, 0);
  return (
    <AnalyticsMetric
      label={`Likely human sessions · ${report.description.toLowerCase()}`}
      value={snapshot.status === "available" ? number(sessions) : "—"}
      hint={snapshot.status === "available"
        ? "Consented browser tabs with trusted input; an estimate, not a unique-person count."
        : "Apply the engaged-sessions migration to start collecting this consent-based estimate."}
      icon="group"
    />
  );
}

function EngagedSessionsChart({ snapshot, report }: { snapshot: SiteEngagedSessionsSnapshot; report: SiteAnalyticsReportRange }) {
  const title = `Likely human sessions · ${report.description.toLowerCase()}`;
  if (snapshot.status !== "available") {
    return (
      <section className="neo-workspace__panel rounded-[22px] p-4 sm:p-5" aria-labelledby="engaged-sessions-heading">
        <h2 id="engaged-sessions-heading" className="text-base font-black text-[#172838] sm:text-lg">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-[#687583]">A conservative estimate based on consented browser tabs after trusted user input.</p>
        <p className="mt-5 rounded-xl border border-dashed border-[#d7e1eb] px-4 py-8 text-center text-sm text-[#687583]">
          Apply migration <code className="rounded bg-[#edf1f5] px-1.5 py-0.5 text-xs">20261022152000_site_analytics_engaged_sessions.sql</code> to start collecting this estimate.
        </p>
      </section>
    );
  }

  const points = snapshot.daily;
  const max = Math.max(1, ...points.map((point) => point.sessions));
  const left = 42, right = 14, top = 14, bottom = 30;
  const plotWidth = 720 - left - right;
  const plotHeight = 176 - top - bottom;
  const pointCoords = points.map((point, index) => ({
    x: left + (points.length <= 1 ? plotWidth / 2 : index / (points.length - 1) * plotWidth),
    y: top + plotHeight - point.sessions / max * plotHeight,
  }));
  const line = pointCoords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const labelIndexes = points.map((_, index) => index).filter((index) => index === 0 || index === points.length - 1 || index % 7 === 0);

  return (
    <section className="neo-workspace__panel rounded-[22px] p-4 sm:p-5" aria-labelledby="engaged-sessions-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="engaged-sessions-heading" className="text-base font-black text-[#172838] sm:text-lg">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-[#687583]">Consented browser-tab sessions with trusted input · {formatSiteAnalyticsReportRange(report)}</p>
        </div>
        <span className="rounded-full bg-[#e8f7f2] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#24785e]">Engagement estimate</span>
      </div>
      <div className="relative mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8]" tabIndex={0} role="region" aria-label="Human-session chart, scroll horizontally">
        <svg className="h-auto min-w-[560px] w-full" viewBox="0 0 720 176" role="img" aria-label={`Likely human sessions by day · ${formatSiteAnalyticsReportRange(report)}`}>
          <title>{title}</title>
          {[0, 1, 2, 3].map((index) => {
            const y = top + index * plotHeight / 3;
            const value = max * (1 - index / 3);
            return (
              <g key={index}>
                <line x1={left} x2={720 - right} y1={y} y2={y} stroke="#dbe4ed" strokeDasharray="3 5" />
                <text x={left - 7} y={y + 3} textAnchor="end" fill="#778594" fontSize="9">{axisNumber(value)}</text>
              </g>
            );
          })}
          <polyline points={line} fill="none" stroke="#1aa89a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {pointCoords.map((point, index) => (
            <circle key={points[index].day} cx={point.x} cy={point.y} r="2.5" fill="#1aa89a">
              <title>{`${points[index].day}: ${number(points[index].sessions)} engaged sessions`}</title>
            </circle>
          ))}
          {labelIndexes.map((index) => (
            <text key={`${points[index].day}-label`} x={pointCoords[index].x} y="171" textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"} fill="#778594" fontSize="10">
              {new Date(`${points[index].day}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}
            </text>
          ))}
        </svg>
        <div className="sr-only"><table>
          <caption>Likely human browser-tab sessions by day. Counts require analytics consent and trusted user input.</caption>
          <thead><tr><th scope="col">UTC day</th><th scope="col">Engaged sessions</th></tr></thead>
          <tbody>{points.map((point) => <tr key={`session-${point.day}`}><th scope="row">{point.day}</th><td>{number(point.sessions)}</td></tr>)}</tbody>
        </table></div>
      </div>
      <p className="mt-2 text-[10px] leading-5 text-[#778594]">This is not a verified count of people. Visitors who decline analytics aren’t included, and automated browsers can imitate interaction.</p>
    </section>
  );
}

function AcquisitionTable({ snapshot, report }: { snapshot?: SiteAcquisitionSnapshot; report: SiteAnalyticsReportRange }) {
  const sourceLabels = new Map<string, string>(SITE_ANALYTICS_SOURCES.map((source) => [source.id, source.label]));
  const grouped = new Map<string, { source: string; landingPath: string; views: number; inquiries: number; quotes: number; checkouts: number }>();
  for (const item of snapshot?.items ?? []) {
    const key = `${item.source}:${item.landingPath}`;
    const row = grouped.get(key) ?? { source: item.source, landingPath: item.landingPath, views: 0, inquiries: 0, quotes: 0, checkouts: 0 };
    if (item.event === "page_view") row.views += item.count;
    if (item.event === "contact_inquiry") row.inquiries += item.count;
    if (item.event === "quote_request") row.quotes += item.count;
    if (item.event === "checkout_start") row.checkouts += item.count;
    grouped.set(key, row);
  }
  const rows = [...grouped.values()].sort((a, b) => b.views - a.views || b.inquiries - a.inquiries);
  return <section className="neo-workspace__panel overflow-hidden rounded-[22px]" aria-labelledby="acquisition-heading">
    <div className="border-b border-[#e0e7ee] p-4 sm:p-5">
      <h2 id="acquisition-heading" className="text-base font-black text-[#172838] sm:text-lg">Search traffic and lead signals</h2>
      <p className="mt-1 text-xs leading-5 text-[#687583]">Consented page views and conversions by entry source and landing page · {report.description.toLowerCase()}</p>
      <p className="mt-1 text-[11px] leading-5 text-[#687583]">{formatSiteAnalyticsReportRange(report)}</p>
    </div>
    {snapshot?.status !== "available" ? <p className="p-5 text-sm leading-6 text-[#687583]">Acquisition collection starts after the site analytics acquisition migration is applied.</p> : rows.length ? <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#6d55e8]" tabIndex={0} role="region" aria-label="Lead signal totals, scroll horizontally">
      <table className="w-full min-w-[700px] text-left text-xs">
        <thead className="bg-[#f5f8fa] text-[10px] uppercase tracking-[0.1em] text-[#748292]"><tr>
          <th scope="col" className="px-4 py-3">Landing page</th><th scope="col" className="px-4 py-3">Source</th>
          <th scope="col" className="px-4 py-3 text-right">Page views</th><th scope="col" className="px-4 py-3 text-right">Inquiries</th>
          <th scope="col" className="px-4 py-3 text-right">Quote requests</th><th scope="col" className="px-4 py-3 text-right">Checkout selections</th>
        </tr></thead>
        <tbody className="divide-y divide-[#e8edf2] text-[#405164]">{rows.map((row) => <tr key={`${row.source}:${row.landingPath}`}>
          <th scope="row" className="max-w-[240px] truncate px-4 py-3 font-bold" title={row.landingPath}>{row.landingPath}</th>
          <td className="px-4 py-3">{sourceLabels.get(row.source)}</td>
          <td className="px-4 py-3 text-right tabular-nums">{number(row.views)}</td><td className="px-4 py-3 text-right tabular-nums">{number(row.inquiries)}</td>
          <td className="px-4 py-3 text-right tabular-nums">{number(row.quotes)}</td><td className="px-4 py-3 text-right tabular-nums">{number(row.checkouts)}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p className="p-5 text-sm leading-6 text-[#687583]">No consented acquisition events were collected in this period.</p>}
    <p className="border-t border-[#e8edf2] px-4 py-3 text-[10px] leading-5 text-[#778594]">Source attribution lasts up to 30 minutes in the browser tab after analytics consent. Inquiries require a submitted form and success message and count once per tab session. Checkout selections count links opened; confirmed payments remain in order records. These client signals are estimates and exclude visitors who decline analytics.</p>
  </section>;
}

type InteractionReportProps = {
  snapshot: SiteInteractionSnapshot;
  report: SiteAnalyticsReportRange;
} & Pick<AnalyticsReportPeriodControlProps, "pendingPeriod" | "onPeriodChange">;

function InteractionTable({ snapshot, report, pendingPeriod, onPeriodChange }: InteractionReportProps) {
  const labels = new Map<string, string>(SITE_ANALYTICS_REGIONS.map((region) => [region.id, region.label]));
  return (
    <section className="neo-workspace__panel overflow-hidden rounded-[22px]" aria-labelledby="interaction-heading" aria-busy={Boolean(pendingPeriod)}>
      <div className="border-b border-[#e0e7ee] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="interaction-heading" className="text-base font-black text-[#172838] sm:text-lg">Where people interact</h2>
            <p className="mt-1 text-xs leading-5 text-[#687583]">Consent-based hover, click, and dwell totals by page area · {report.description.toLowerCase()}</p>
            <p className="mt-1 text-[11px] leading-5 text-[#687583]">{formatSiteAnalyticsReportRange(report)}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${snapshot.status === "available" ? "bg-[#e8f7f2] text-[#24785e]" : "bg-[#fff3d9] text-[#95600f]"}`}>
            {snapshot.status === "available" ? "Ready" : "Setup needed"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <AnalyticsReportPeriodControl period={report.period} pendingPeriod={pendingPeriod} onPeriodChange={onPeriodChange} label="Interaction report period" />
          <p className="text-[11px] leading-5 text-[#687583]">Also updates session estimates and lead signals.</p>
        </div>
      </div>
      {snapshot.status === "not-configured" ? (
        <p className="p-5 text-sm leading-6 text-[#687583]">Interaction data is waiting for the Supabase migration <code className="rounded bg-[#edf1f5] px-1.5 py-0.5 text-xs">20261016160000_site_analytics_interactions.sql</code>. Collection starts after that migration is applied.</p>
      ) : snapshot.items.length ? (
        <div className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#6d55e8]" tabIndex={0} role="region" aria-label="Interaction totals, scroll horizontally">
          <table className="w-full min-w-[600px] text-left text-xs">
            <thead className="bg-[#f5f8fa] text-[10px] uppercase tracking-[0.1em] text-[#748292]">
              <tr><th scope="col" className="px-4 py-3 font-black">Page</th><th scope="col" className="px-4 py-3 font-black">Area</th><th scope="col" className="px-4 py-3 text-right font-black">Hovers</th><th scope="col" className="px-4 py-3 text-right font-black">Clicks</th><th scope="col" className="px-4 py-3 text-right font-black">Dwell time</th></tr>
            </thead>
            <tbody className="divide-y divide-[#e8edf2] text-[#405164]">
              {snapshot.items.map((item) => (
                <tr key={`${item.pagePath}-${item.region}`}>
                  <td className="max-w-[260px] truncate px-4 py-3 font-bold" title={item.pagePath}>{item.pagePath}</td>
                  <td className="px-4 py-3">{labels.get(item.region) ?? "Page area"}</td>
                  <td className="px-4 py-3 text-right font-black tabular-nums">{number(item.hoverCount)}</td>
                  <td className="px-4 py-3 text-right font-black tabular-nums">{number(item.clickCount)}</td>
                  <td className="px-4 py-3 text-right font-black tabular-nums">{Math.round(item.dwellMs / 60_000)} min</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="p-5 text-sm leading-6 text-[#687583]">No consented interactions were collected in this period. Visitors can choose “Accept all” in the cookie notice to contribute anonymous area totals.</p>
      )}
      <p className="border-t border-[#e8edf2] px-4 py-3 text-[10px] leading-5 text-[#778594]">Only named page areas are counted. Cursor coordinates, typed content, identifiers, and full URLs are not stored.</p>
    </section>
  );
}

export function AnalyticsDashboard({ snapshot, interactions, engagedSessions, report, pendingPeriod, onPeriodChange }: {
  snapshot: CloudflareAnalyticsDashboard;
  interactions: SiteInteractionSnapshot;
  engagedSessions: SiteEngagedSessionsSnapshot;
  report: SiteAnalyticsReportRange;
} & Pick<AnalyticsReportPeriodControlProps, "pendingPeriod" | "onPeriodChange">) {
  if (snapshot.status !== "available") {
    return <div className="space-y-5"><section className="grid gap-3 sm:grid-cols-2"><EngagedSessionsMetric snapshot={engagedSessions} report={report} /><ProviderState status={snapshot.status} /></section><EngagedSessionsChart snapshot={engagedSessions} report={report} /><AcquisitionTable snapshot={interactions.acquisition} report={report} /><InteractionTable snapshot={interactions} report={report} pendingPeriod={pendingPeriod} onPeriodChange={onPeriodChange} /></div>;
  }

  const lastDay = snapshot.daily[snapshot.daily.length - 1];
  const pageViewsToday = snapshot.hourly.reduce((sum, point) => sum + point.pageViews, 0);
  const dailyPoints = snapshot.daily.map((point) => ({
    label: point.day,
    visitors: point.visitors,
    pageViews: point.pageViews,
  }));
  const hourlyPoints = snapshot.hourly.map((point) => ({
    label: point.hour,
    visitors: point.visitors,
    pageViews: point.pageViews,
  }));
  const dailyLabels = snapshot.daily.map((point) => new Date(`${point.day}T12:00:00Z`).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }));
  const hourlyLabels = snapshot.hourly.map((point) => new Date(point.hour).toLocaleTimeString("en", { hour: "numeric", timeZone: "UTC" }));
  const threats30Days = snapshot.daily.reduce((sum, point) => sum + point.threats, 0);

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Traffic summary">
        <EngagedSessionsMetric snapshot={engagedSessions} report={report} />
        <AnalyticsMetric label="Cloudflare visitor IPs · today" value={metricValue(lastDay?.visitors)} hint="Estimated unique IPs; this may include automated traffic and isn’t a people count." icon="group" />
        <AnalyticsMetric label="Page views · 24 hours" value={number(pageViewsToday)} hint="Page views across the recent hourly reporting window." icon="visibility" />
        <AnalyticsMetric
          label={`Edge requests · ${snapshot.recentRequestWindow}`}
          value={number(snapshot.recentRequests)}
          hint={snapshot.recentRequestWindow === "five minutes" ? "Requests handled by Cloudflare in the last five minutes." : "Requests in the current UTC hour; the five-minute summary needs additional Cloudflare analytics access."}
          icon="language"
        />
        <AnalyticsMetric
          label="Bot-like requests · 5 min"
          value={metricValue(snapshot.recognizedBotRequests)}
          hint={snapshot.recognizedBotRequests === undefined ? "The five-minute bot summary needs additional Cloudflare analytics access." : "User-agent pattern estimate; not Cloudflare's verified bot verdict."}
          icon="smart_toy"
        />
      </section>

      <section className="space-y-3" aria-label="Traffic charts">
        <TrafficChart title="Visitors and page views · 30 days" subtitle="Daily unique IP estimates and page-view totals. A visitor IP is not necessarily one person." points={dailyPoints} labels={dailyLabels} />
        <TrafficChart title="Traffic pulse · 24 hours" subtitle="Hourly visitor IP estimates and page views, reported in UTC." points={hourlyPoints} labels={hourlyLabels} />
        <EngagedSessionsChart snapshot={engagedSessions} report={report} />
      </section>

      <section className="grid gap-3 xl:grid-cols-2" aria-label="Visitor origin and popular pages">
        <CountryReport snapshot={snapshot} />
        <RankList
          title="Most requested pages"
          subtitle="HTML-like paths in the last 24 hours; static assets and API routes are excluded."
          rows={snapshot.topPages.map((row) => ({ id: row.path, title: row.path, value: row.requests, caption: `${number(row.errors)} responses with errors` }))}
          valueLabel="requests"
          emptyMessage={snapshot.topPagesAvailable ? "No page path data reported for this period." : "Page path data needs additional Cloudflare SQL analytics access."}
        />
      </section>

      <section className="neo-workspace__panel overflow-hidden rounded-[22px]" aria-labelledby="bot-activity-heading">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e0e7ee] p-4 sm:p-5">
          <div>
            <h2 id="bot-activity-heading" className="text-base font-black text-[#172838] sm:text-lg">What automated clients are doing</h2>
            <p className="mt-1 text-xs leading-5 text-[#687583]">Bot-like user agents, requested paths, and edge response codes · last 24 hours</p>
          </div>
          <span className="rounded-full bg-[#f1edff] px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#5c49c8]">Heuristic classification</span>
        </div>
        {snapshot.botActivity.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="bg-[#f5f8fa] text-[10px] uppercase tracking-[0.1em] text-[#748292]">
                <tr><th scope="col" className="px-4 py-3 font-black">Bot group</th><th scope="col" className="px-4 py-3 font-black">Path</th><th scope="col" className="px-4 py-3 text-right font-black">Status</th><th scope="col" className="px-4 py-3 text-right font-black">Requests</th></tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf2] text-[#405164]">
                {snapshot.botActivity.map((row, index) => (
                  <tr key={`${row.bot}-${row.path}-${row.status}-${index}`}>
                    <td className="px-4 py-3 font-bold">{row.bot}</td>
                    <td className="max-w-[260px] truncate px-4 py-3" title={row.path}>{row.path}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">{row.status}</td>
                    <td className="px-4 py-3 text-right font-black tabular-nums">{number(row.requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-5 text-sm leading-6 text-[#687583]">{snapshot.botActivityAvailable ? "No bot-like requests matched the current user-agent rules." : "Bot path details need additional Cloudflare SQL analytics access."}</p>
        )}
        <p className="border-t border-[#e8edf2] px-4 py-3 text-[10px] leading-5 text-[#778594]">The report groups and discards full user-agent strings. Cloudflare's sampled dataset may under- or over-represent low-volume activity.</p>
      </section>

      <section className="neo-workspace__panel flex flex-wrap items-center justify-between gap-3 rounded-[18px] px-4 py-3 text-xs text-[#687583]" aria-label="Security summary">
        <span className="inline-flex items-center gap-2"><span className="material-symbols-outlined text-[17px] text-[#5c49c8]" aria-hidden="true">shield</span>{number(threats30Days)} threat events in the last 30 days</span>
        <span>Cloudflare analytics uses adaptive sampling on this dataset.</span>
      </section>

      <AcquisitionTable snapshot={interactions.acquisition} report={report} />
      <InteractionTable snapshot={interactions} report={report} pendingPeriod={pendingPeriod} onPeriodChange={onPeriodChange} />
    </div>
  );
}
