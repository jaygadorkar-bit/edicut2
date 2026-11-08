import { describe, expect, it } from "vitest";
import { formatSiteAnalyticsReportRange, getSiteAnalyticsReportRange, siteAnalyticsReportDays } from "./site-analytics-report";

describe("UTC on-site report ranges", () => {
  const now = new Date("2026-10-23T18:45:00Z");
  it.each([
    ["daily", 1, "2026-10-23"],
    ["weekly", 7, "2026-10-17"],
    ["monthly", 30, "2026-09-24"],
  ])("uses %s as a bounded window including the current UTC day", (period, days, startDay) => {
    const report = getSiteAnalyticsReportRange(period, now);
    expect(report).toMatchObject({ period, days, startDay, endDay: "2026-10-23", endExclusiveDay: "2026-10-24" });
    const dates = siteAnalyticsReportDays(report);
    expect(dates).toHaveLength(days);
    expect(dates[0]).toBe(startDay);
    expect(dates.at(-1)).toBe("2026-10-23");
  });
  it.each([undefined, null, "invalid", "DAILY", "daily; DROP TABLE logs", ["daily"]])("defaults invalid periods to a bounded monthly report", (value) => {
    expect(getSiteAnalyticsReportRange(value, now).period).toBe("monthly");
  });
  it("uses UTC across browser timezone and year boundaries", () => {
    const report = getSiteAnalyticsReportRange("weekly", new Date("2027-01-01T00:15:00+06:00"));
    expect(report).toMatchObject({ startDay: "2026-12-25", endDay: "2026-12-31", endExclusiveDay: "2027-01-01" });
  });
  it("handles leap days and daylight saving transitions as UTC dates", () => {
    expect(getSiteAnalyticsReportRange("weekly", new Date("2028-03-01T12:00:00Z")).startDay).toBe("2028-02-24");
    const dates = siteAnalyticsReportDays(getSiteAnalyticsReportRange("weekly", new Date("2026-03-10T12:00:00Z")));
    expect(new Set(dates).size).toBe(7);
    expect(dates).toContain("2026-03-08");
  });
  it("formats explicit UTC dates, including a single day", () => {
    expect(formatSiteAnalyticsReportRange(getSiteAnalyticsReportRange("daily", now))).toBe("23 Oct 2026 · UTC");
    expect(formatSiteAnalyticsReportRange(getSiteAnalyticsReportRange("weekly", now))).toBe("17 Oct 2026 – 23 Oct 2026 · UTC");
  });
});
