import { Fragment, useMemo, useState } from "react";
import { Form } from "react-router";
import type {
  AdminSecurityLogRange,
  CloudflareErrorLogEntry,
  CloudflareSecurityLogSnapshot,
  CloudflareThreatLogEntry,
} from "../../lib/provider-usage.server";
import type { ApplicationErrorLogSnapshot } from "../../lib/application-error-log.server";
import { Select } from "../Select";

type LogKind = "errors" | "threats";
type LogEntry = CloudflareErrorLogEntry | CloudflareThreatLogEntry;

const rangeOptions: Array<{ value: AdminSecurityLogRange; label: string }> = [
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
];

function number(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function dateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown time"
    : new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(date);
}

function country(value: string) {
  if (!/^[A-Z]{2}$/.test(value)) return "Unknown location";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(value) || value;
  } catch {
    return value;
  }
}

function isErrorEntry(entry: LogEntry): entry is CloudflareErrorLogEntry {
  return "status" in entry;
}

function actionKind(action: string) {
  const normalized = action.toLowerCase().replace(/[ _-]/g, "");
  if (normalized.includes("block")) return "block";
  if (normalized.includes("solved") || normalized.includes("bypassed") || normalized.includes("passed")) return "other";
  if (["challenge", "jschallenge", "managedchallenge"].includes(normalized)) return "challenge";
  return "other";
}

function Metric({ label, value, hint, icon }: { label: string; value: string | number; hint: string; icon: string }) {
  return (
    <article className="neo-workspace__stat-card min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#738292]">{label}</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-[#172838]">{typeof value === "number" ? number(value) : value}</p>
        </div>
        <span className="neo-icon-badge material-symbols-outlined shrink-0" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#748292]">{hint}</p>
    </article>
  );
}

function csvCell(value: string | number) {
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, " ");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function downloadCsv(kind: LogKind, entries: LogEntry[]) {
  const headers = kind === "errors"
    ? ["Timestamp (UTC)", "Edge status", "Origin status", "Security action", "Path", "Ray ID"]
    : ["Timestamp (UTC)", "Action", "Source", "Path", "Country"];
  const rows = entries.map((entry) => isErrorEntry(entry)
    ? [entry.timestamp, entry.status, entry.originStatus ?? "", entry.securityAction, entry.path, entry.rayId]
    : [entry.timestamp, entry.action, entry.source, entry.path, entry.country]);
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `edicut-${kind}-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function ProviderState({ kind, status }: { kind: LogKind; status: Exclude<CloudflareSecurityLogSnapshot["status"], "available"> }) {
  const copy = status === "not-configured"
    ? {
        title: "Cloudflare analytics is not configured",
        body: "Add a server-side Cloudflare API token and zone ID or zone name to load these events.",
      }
    : status === "permission-required"
      ? {
          title: "Cloudflare access is required",
          body: "The server token could not read this event dataset. Review its zone analytics permissions, then refresh this page.",
        }
      : {
          title: "Cloudflare events could not be loaded",
          body: "The provider request failed. Try again shortly; the page hides provider response details and credentials.",
        };

  return (
    <section className="neo-workspace__panel rounded-[22px] border border-[#e0e7ee] p-5 sm:p-7" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined mt-0.5 text-[22px] text-[#6d55e8]" aria-hidden="true">{status === "not-configured" ? "settings" : "error"}</span>
        <div>
          <h2 className="font-black text-[#172838]">{copy.title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[#687583]">{copy.body}</p>
          {status === "not-configured" && <p className="mt-3 text-xs text-[#7b8995]">Expected: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID (or CLOUDFLARE_ZONE_NAME).</p>}
        </div>
      </div>
      <p className="mt-5 rounded-xl bg-[#f5f8fa] px-4 py-3 text-xs leading-5 text-[#687583]">
        {kind === "errors" ? "The Cloudflare portion covers sampled edge HTTP 4xx/5xx responses. Application exceptions are recorded separately above when the private database log is available." : "This log covers sampled Cloudflare firewall events. EdiCut does not request or display client IP addresses, user-agent strings, or request query strings."}
      </p>
    </section>
  );
}

function TopBreakdown({ entries, kind }: { entries: LogEntry[]; kind: LogKind }) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = kind === "errors"
      ? `${(entry as CloudflareErrorLogEntry).status} · ${(entry as CloudflareErrorLogEntry).path}`
      : `${(entry as CloudflareThreatLogEntry).source} · ${(entry as CloudflareThreatLogEntry).action}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const items = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <section className="neo-workspace__panel rounded-[22px] p-4 sm:p-5" aria-labelledby="log-breakdown-heading">
      <div>
        <h2 id="log-breakdown-heading" className="text-base font-black text-[#172838]">{kind === "errors" ? "Frequent error responses" : "Top firewall sources"}</h2>
        <p className="mt-1 text-xs leading-5 text-[#687583]">Most common in the events currently available below.</p>
      </div>
      {items.length ? (
        <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {items.map(([label, count]) => (
            <li key={label} className="min-w-0 rounded-xl border border-[#e1e8ef] bg-white/55 px-3 py-3">
              <p className="truncate text-xs font-bold text-[#405164]" title={label}>{label}</p>
              <p className="mt-1 text-lg font-black tabular-nums text-[#172838]">{number(count)}</p>
              <p className="text-[10px] text-[#7b8995]">sampled events</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-[#d7e1eb] px-4 py-5 text-center text-xs text-[#687583]">No events to break down for this time window.</p>
      )}
    </section>
  );
}

function ApplicationErrorLogPanel({ snapshot }: { snapshot: ApplicationErrorLogSnapshot }) {
  const entries = snapshot.entries;
  const occurrenceTotal = entries.reduce((sum, entry) => sum + entry.occurrences, 0);

  return (
    <section className="neo-workspace__panel overflow-hidden rounded-[22px]" aria-labelledby="application-errors-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e0e7ee] p-4 sm:p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="application-errors-heading" className="text-base font-black text-[#172838] sm:text-lg">Application 500 diagnostics</h2>
            <span className="rounded-full bg-[#f1edff] px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#5c49c8]">private · aggregated</span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#687583]">Server exceptions with a redacted cause and stack trace, grouped to limit log volume.</p>
        </div>
        {snapshot.status === "available" && (
          <div className="flex gap-2 text-right">
            <div className="rounded-xl bg-white/70 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wide text-[#7b8995]">Signatures</p>
              <p className="mt-0.5 text-sm font-black tabular-nums text-[#172838]">{number(entries.length)}</p>
            </div>
            <div className="rounded-xl bg-white/70 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wide text-[#7b8995]">Reported hits</p>
              <p className="mt-0.5 text-sm font-black tabular-nums text-[#172838]">{number(occurrenceTotal)}</p>
            </div>
          </div>
        )}
      </div>

      {snapshot.status === "unavailable" ? (
        <div className="p-5" role="status">
          <p className="text-sm font-bold text-[#334456]">Application diagnostics are unavailable.</p>
          <p className="mt-1 text-xs leading-5 text-[#687583]">Apply the application error log database migration and check the server database connection. Cloudflare edge events remain available below.</p>
        </div>
      ) : entries.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <caption className="sr-only">Recent application exceptions, deduplicated by error signature. Time window: {snapshot.range}.</caption>
            <thead className="bg-[#f5f8fa] text-[10px] uppercase tracking-[0.1em] text-[#748292]">
              <tr>
                <th scope="col" className="px-4 py-3 font-black">Last seen · UTC</th>
                <th scope="col" className="px-4 py-3 font-black">Error</th>
                <th scope="col" className="px-4 py-3 font-black">Route</th>
                <th scope="col" className="px-4 py-3 text-right font-black">Reported</th>
                <th scope="col" className="px-4 py-3 font-black">Cause and stack</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8edf2] text-[#405164]">
              {entries.map((entry) => (
                <tr key={entry.fingerprint} className="align-top hover:bg-white/40">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums">{dateTime(entry.lastSeenAt)}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-[#172838]">{entry.errorName}</p>
                    <p className="mt-1 text-[10px] text-[#7b8995]">{entry.method} · first seen {dateTime(entry.firstSeenAt)}</p>
                  </td>
                  <td className="max-w-[260px] break-all px-4 py-3 font-mono text-[11px]">{entry.route}</td>
                  <td className="px-4 py-3 text-right font-black tabular-nums">{number(entry.occurrences)}</td>
                  <td className="max-w-[440px] px-4 py-3">
                    <details>
                      <summary className="cursor-pointer font-bold text-[#5c49c8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6955df]">Inspect sanitized details</summary>
                      <p className="mt-2 break-words leading-5 text-[#334456]">{entry.message}</p>
                      {entry.stack ? <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#f5f7fa] p-3 font-mono text-[10px] leading-4 text-[#526170]">{entry.stack}</pre> : <p className="mt-2 text-[10px] text-[#7b8995]">No stack trace was available for this response.</p>}
                      <p className="mt-2 font-mono text-[9px] text-[#8793a0]">Fingerprint · {entry.fingerprint.slice(0, 16)}</p>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-6 text-center">
          <span className="material-symbols-outlined text-3xl text-[#8b99a6]" aria-hidden="true">task_alt</span>
          <p className="mt-2 text-sm font-bold text-[#334456]">No application exceptions in this window</p>
          <p className="mt-1 text-xs leading-5 text-[#7b8995]">Unexpected server errors appear with a sanitized cause and stack. Signatures are deduplicated, capped at {snapshot.maxStored}, and retained for up to {snapshot.retentionDays} days.</p>
        </div>
      )}
      {snapshot.status === "available" && entries.length > 0 && (
        <p className="border-t border-[#e8edf2] bg-white/30 px-4 py-3 text-[10px] leading-5 text-[#778594]">Showing up to {snapshot.limit} of at most {snapshot.maxStored} stored signatures, retained for {snapshot.retentionDays} days. Repeated failures are aggregated. Request bodies, headers, query strings, IP addresses, and cookies are not stored.</p>
      )}
    </section>
  );
}

export function SecurityLogDashboard({ kind, snapshot, applicationErrors }: {
  kind: LogKind;
  snapshot: CloudflareSecurityLogSnapshot;
  applicationErrors?: ApplicationErrorLogSnapshot;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const isErrorLog = kind === "errors";
  const entries = snapshot.status === "available" ? snapshot.events : [];
  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (isErrorEntry(entry)) {
        if (category === "4xx" && (entry.status < 400 || entry.status >= 500)) return false;
        if (category === "5xx" && entry.status < 500) return false;
      } else if (category !== "all") {
        if (actionKind(entry.action) !== category) return false;
      }
      if (!normalizedQuery) return true;
      const searchable = isErrorEntry(entry)
        ? `${entry.timestamp} ${entry.path} ${entry.status} ${entry.originStatus ?? ""} ${entry.rayId} ${entry.securityAction}`
        : `${entry.timestamp} ${entry.path} ${entry.action} ${entry.source} ${entry.country}`;
      return searchable.toLowerCase().includes(normalizedQuery);
    });
  }, [entries, query, category]);

  if (snapshot.status !== "available") return (
    <div className="space-y-5">
      {isErrorLog && applicationErrors ? <ApplicationErrorLogPanel snapshot={applicationErrors} /> : null}
      <ProviderState kind={kind} status={snapshot.status} />
    </div>
  );

  const errors4xx = entries.filter((entry) => isErrorEntry(entry) && entry.status < 500).length;
  const errors5xx = entries.filter((entry) => isErrorEntry(entry) && entry.status >= 500).length;
  const blocks = entries.filter((entry) => !isErrorEntry(entry) && actionKind(entry.action) === "block").length;
  const challenges = entries.filter((entry) => !isErrorEntry(entry) && actionKind(entry.action) === "challenge").length;
  const uniqueRoutes = new Set(entries.map((entry) => entry.path)).size;
  const uniqueSources = new Set(entries.filter((entry): entry is CloudflareThreatLogEntry => !isErrorEntry(entry)).map((entry) => entry.source)).size;

  return (
    <div className="space-y-5">
      {isErrorLog && applicationErrors ? <ApplicationErrorLogPanel snapshot={applicationErrors} /> : null}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={`${isErrorLog ? "Error" : "Threat"} log summary`}>
        <Metric label="Events in sample" value={entries.length} hint={`Up to ${snapshot.limit} recent Cloudflare events.`} icon={isErrorLog ? "error" : "shield"} />
        {isErrorLog ? <>
          <Metric label="4xx responses" value={errors4xx} hint="Client error responses (400–499) in this sample." icon="warning" />
          <Metric label="5xx responses" value={errors5xx} hint="Server error responses (500–599) in this sample." icon="cloud_alert" />
          <Metric label="Affected routes" value={uniqueRoutes} hint="Distinct paths in the returned sample." icon="route" />
        </> : <>
          <Metric label="Blocked" value={blocks} hint="Firewall events with a block action." icon="block" />
          <Metric label="Challenged" value={challenges} hint="Challenge actions in the returned sample." icon="verified_user" />
          <Metric label="Firewall sources" value={uniqueSources} hint="Distinct Cloudflare event sources in this sample." icon="policy" />
        </>}
      </section>

      <TopBreakdown entries={entries} kind={kind} />

      <section className="neo-workspace__panel overflow-hidden rounded-[22px]" aria-labelledby="security-log-events-heading">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e0e7ee] p-4 sm:p-5">
          <div>
            <h2 id="security-log-events-heading" className="text-base font-black text-[#172838] sm:text-lg">Recent {isErrorLog ? "error responses" : "firewall events"}</h2>
            <p className="mt-1 text-xs leading-5 text-[#687583]">{number(filteredEntries.length)} shown · {number(entries.length)} returned from Cloudflare</p>
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(kind, filteredEntries)}
            disabled={filteredEntries.length === 0}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[#d5dee8] bg-white/80 px-3 text-xs font-black text-[#425365] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[17px]" aria-hidden="true">download</span>
            Export filtered CSV
          </button>
        </div>

        <div className="flex flex-col gap-3 border-b border-[#e8edf2] bg-white/30 p-4 md:flex-row md:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-[#748292]">Search events</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={isErrorLog ? "Path, status, Ray ID, security action…" : "Path, action, source, country…"}
              className="min-h-11 w-full rounded-xl border border-[#d5dee8] bg-white px-3 text-sm text-[#172838] outline-none placeholder:text-[#9aa6b2] focus:border-[#6955df] focus:ring-2 focus:ring-[#6955df]/15"
            />
          </label>
          <label className="w-full md:w-56">
            <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.1em] text-[#748292]">{isErrorLog ? "Response class" : "Firewall action"}</span>
            <Select
              value={category}
              onChange={(event) => setCategory(event.currentTarget.value)}
              className="min-h-11 w-full rounded-xl border border-[#d5dee8] bg-white px-3 text-sm text-[#172838] outline-none focus:border-[#6955df] focus:ring-2 focus:ring-[#6955df]/15"
            >
              <option value="all">All events</option>
              {isErrorLog ? <>
                <option value="4xx">4xx responses</option>
                <option value="5xx">5xx responses</option>
              </> : <>
                <option value="block">Blocked</option>
                <option value="challenge">Challenged</option>
                <option value="other">Other actions</option>
              </>}
            </Select>
          </label>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e8edf2] px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-[#748292]">Time window</p>
            <p className="mt-1 text-[11px] text-[#7b8995]">{snapshot.status === "available" ? `Retrieved ${dateTime(snapshot.retrievedAt)}` : ""}</p>
          </div>
          <Form method="get" className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`${kind}-log-range`}>Log time window</label>
            <Select id={`${kind}-log-range`} name="range" defaultValue={snapshot.range} className="min-h-10 rounded-xl border border-[#d5dee8] bg-white px-3 text-xs font-bold text-[#425365] focus:border-[#6955df] focus:outline-none focus:ring-2 focus:ring-[#6955df]/15">
              {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
            <button type="submit" className="min-h-10 rounded-xl bg-[#172838] px-4 text-xs font-black text-white transition hover:bg-[#2c4054]">Apply</button>
          </Form>
        </div>

        {filteredEntries.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-xs">
              <caption className="sr-only">{isErrorLog ? "Sampled HTTP error responses" : "Sampled Cloudflare firewall events"}; timestamps shown in UTC.</caption>
              <thead className="bg-[#f5f8fa] text-[10px] uppercase tracking-[0.1em] text-[#748292]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-black">Time (UTC)</th>
                  {isErrorLog ? <>
                    <th scope="col" className="px-4 py-3 font-black">Edge status</th>
                    <th scope="col" className="px-4 py-3 font-black">Origin status</th>
                    <th scope="col" className="px-4 py-3 font-black">Security action</th>
                    <th scope="col" className="px-4 py-3 font-black">Path</th>
                            <th scope="col" className="px-4 py-3 font-black">Ray ID</th>
                  </> : <>
                    <th scope="col" className="px-4 py-3 font-black">Action</th>
                    <th scope="col" className="px-4 py-3 font-black">Source</th>
                    <th scope="col" className="px-4 py-3 font-black">Path</th>
                    <th scope="col" className="px-4 py-3 font-black">Country</th>
                  </>}
                  <th scope="col" className="px-4 py-3 text-right font-black">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf2] text-[#405164]">
                {filteredEntries.map((entry, index) => {
                  const id = `${entry.timestamp}-${entry.path}-${index}`;
                  const expanded = expandedId === id;
                  return (
                    <Fragment key={id}>
                      <tr className={expanded ? "bg-[#f8f7ff]" : "hover:bg-white/50"}>
                        <td className="whitespace-nowrap px-4 py-3 font-medium tabular-nums">{dateTime(entry.timestamp)}</td>
                        {isErrorEntry(entry) ? <>
                          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 font-black tabular-nums ${entry.status >= 500 ? "bg-[#fff0ed] text-[#a93624]" : "bg-[#fff7e8] text-[#9a6514]"}`}>{entry.status}</span></td>
                          <td className="px-4 py-3 tabular-nums">{entry.originStatus ?? "—"}</td>
                          <td className="px-4 py-3">{entry.securityAction}</td>
                          <td className="max-w-[280px] truncate px-4 py-3 font-mono text-[11px]" title={entry.path}>{entry.path}</td>
                          <td className="px-4 py-3 font-mono text-[10px]">{entry.rayId}</td>
                        </> : <>
                          <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 font-black capitalize ${actionKind(entry.action) === "block" ? "bg-[#fff0ed] text-[#a93624]" : actionKind(entry.action) === "challenge" ? "bg-[#fff7e8] text-[#9a6514]" : "bg-[#edf4fb] text-[#405d7a]"}`}>{entry.action.replace(/[_-]+/g, " ")}</span></td>
                          <td className="px-4 py-3 font-bold">{entry.source}</td>
                          <td className="max-w-[280px] truncate px-4 py-3 font-mono text-[11px]" title={entry.path}>{entry.path}</td>
                          <td className="px-4 py-3">{country(entry.country)}</td>
                        </>}
                        <td className="px-4 py-3 text-right">
                          <button type="button" aria-expanded={expanded} aria-controls={`event-details-${index}`} onClick={() => setExpandedId(expanded ? null : id)} className="min-h-9 rounded-lg px-2.5 font-black text-[#5c49c8] hover:bg-[#f1edff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6955df]">{expanded ? "Hide" : "View"}</button>
                        </td>
                      </tr>
                      {expanded && <tr id={`event-details-${index}`}>
                          <td colSpan={isErrorLog ? 7 : 6} className="bg-[#f8f7ff] px-4 py-4">
                          <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                            <div><dt className="font-bold text-[#7b8995]">Exact time · UTC</dt><dd className="mt-1 font-semibold text-[#334456]">{dateTime(entry.timestamp)}</dd></div>
                            <div><dt className="font-bold text-[#7b8995]">Request path</dt><dd className="mt-1 break-all font-mono text-[#334456]">{entry.path}</dd></div>
                            {isErrorEntry(entry) ? <>
                              <div><dt className="font-bold text-[#7b8995]">Origin status</dt><dd className="mt-1 text-[#334456]">{entry.originStatus ?? "Not reported"}</dd></div>
                              <div><dt className="font-bold text-[#7b8995]">Ray ID</dt><dd className="mt-1 break-all font-mono text-[#334456]">{entry.rayId}</dd></div>
                              <div><dt className="font-bold text-[#7b8995]">Security action</dt><dd className="mt-1 text-[#334456]">{entry.securityAction}</dd></div>
                            </> : <div><dt className="font-bold text-[#7b8995]">Country</dt><dd className="mt-1 text-[#334456]">{country(entry.country)}</dd></div>}
                            <div><dt className="font-bold text-[#7b8995]">Record scope</dt><dd className="mt-1 text-[#334456]">Cloudflare edge event · sampled</dd></div>
                          </dl>
                          <p className="mt-3 border-t border-[#e5e1fb] pt-3 text-[11px] leading-5 text-[#687583]">{isErrorEntry(entry) ? `HTTP ${entry.status} ${entry.status >= 500 ? "server or gateway response" : "client response"}. This does not include application stack traces.` : `Firewall action: ${entry.action} · source: ${entry.source}. No IP address, request query, or user-agent is included in this view.`}</p>
                        </td>
                      </tr>}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-7 text-center">
            <span className="material-symbols-outlined text-3xl text-[#8b99a6]" aria-hidden="true">{entries.length ? "search_off" : "task_alt"}</span>
            <p className="mt-2 text-sm font-bold text-[#334456]">{entries.length ? "No events match these filters" : "No events in this time window"}</p>
            <p className="mt-1 text-xs text-[#7b8995]">{entries.length ? "Try a shorter search or choose a different event type." : "Cloudflare returned no matching records for the selected period."}</p>
          </div>
        )}

        <div className="border-t border-[#e8edf2] bg-white/30 px-4 py-3 text-[10px] leading-5 text-[#778594]">
          Cloudflare Analytics event data is adaptively sampled and this view is capped at {snapshot.limit} records. It is useful for recent triage and does not archive every event. {isErrorLog ? "Application exceptions are deduplicated and shown in the private diagnostics panel above." : "The Threat Log uses firewall event actions and does not expose request IP addresses, query strings, or user agents."}
        </div>
      </section>
    </div>
  );
}
