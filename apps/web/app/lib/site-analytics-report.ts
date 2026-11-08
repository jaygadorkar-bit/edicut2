export const SITE_ANALYTICS_REPORT_PERIODS = [
  { id: "daily", label: "Daily", days: 1, description: "Today" },
  { id: "weekly", label: "Weekly", days: 7, description: "Last 7 days" },
  { id: "monthly", label: "Monthly", days: 30, description: "Last 30 days" },
] as const;

export type SiteAnalyticsReportPeriod = typeof SITE_ANALYTICS_REPORT_PERIODS[number]["id"];
export type SiteAnalyticsReportRange = {
  period: SiteAnalyticsReportPeriod;
  days: number;
  description: string;
  startDay: string;
  endDay: string;
  endExclusiveDay: string;
};

const DAY_MS = 86_400_000;

/** The collection tables use UTC dates. Never interpret a report in the browser/database timezone. */
export function getSiteAnalyticsReportRange(value: unknown = "monthly", now = new Date()): SiteAnalyticsReportRange {
  const selected = SITE_ANALYTICS_REPORT_PERIODS.find((item) => item.id === value) ?? SITE_ANALYTICS_REPORT_PERIODS[2];
  const endDay = now.toISOString().slice(0, 10);
  const midnight = Date.parse(`${endDay}T00:00:00.000Z`);
  return {
    period: selected.id,
    days: selected.days,
    description: selected.description,
    startDay: new Date(midnight - (selected.days - 1) * DAY_MS).toISOString().slice(0, 10),
    endDay,
    endExclusiveDay: new Date(midnight + DAY_MS).toISOString().slice(0, 10),
  };
}

export function siteAnalyticsReportDays(report: SiteAnalyticsReportRange): string[] {
  const start = Date.parse(`${report.startDay}T00:00:00.000Z`);
  return Array.from({ length: report.days }, (_, index) => new Date(start + index * DAY_MS).toISOString().slice(0, 10));
}

export function formatSiteAnalyticsReportRange(report: SiteAnalyticsReportRange): string {
  const format = (day: string) => new Date(`${day}T00:00:00.000Z`).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
  return `${format(report.startDay)}${report.startDay === report.endDay ? "" : ` – ${format(report.endDay)}`} · UTC`;
}
