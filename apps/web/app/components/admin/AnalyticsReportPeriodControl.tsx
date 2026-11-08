import { SITE_ANALYTICS_REPORT_PERIODS, type SiteAnalyticsReportPeriod } from "../../lib/site-analytics-report";

export type AnalyticsReportPeriodControlProps = {
  period: SiteAnalyticsReportPeriod;
  pendingPeriod?: SiteAnalyticsReportPeriod;
  onPeriodChange: (period: SiteAnalyticsReportPeriod) => void;
  label?: string;
};

export function AnalyticsReportPeriodControl({ period, pendingPeriod, onPeriodChange, label = "On-site report period" }: AnalyticsReportPeriodControlProps) {
  return (
    <div role="group" aria-label={label} aria-busy={Boolean(pendingPeriod)} className="inline-flex max-w-full rounded-2xl border border-white/80 bg-[#e7edf2] p-1 shadow-[inset_3px_3px_7px_rgba(164,179,193,0.18),inset_-3px_-3px_7px_rgba(255,255,255,0.7)]">
      {SITE_ANALYTICS_REPORT_PERIODS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={period === item.id}
          aria-disabled={Boolean(pendingPeriod)}
          onClick={() => { if (!pendingPeriod && period !== item.id) onPeriodChange(item.id); }}
          className={`min-h-11 rounded-xl px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6d55e8] aria-disabled:cursor-wait aria-disabled:opacity-70 sm:px-4 ${period === item.id ? "border border-white bg-[#f8fafc] text-[#c41230] shadow-[3px_3px_8px_rgba(164,179,193,0.22),-3px_-3px_8px_rgba(255,255,255,0.8)]" : "border border-transparent text-[#526579] hover:bg-white/50"}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
