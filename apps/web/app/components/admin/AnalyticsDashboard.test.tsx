import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsDashboard } from "./AnalyticsDashboard";
import type { CloudflareAnalyticsDashboard } from "../../lib/provider-usage.server";
import type { SiteEngagedSessionsSnapshot, SiteInteractionSnapshot } from "../../lib/site-analytics.server";
import { getSiteAnalyticsReportRange } from "../../lib/site-analytics-report";

const snapshot: CloudflareAnalyticsDashboard = {
  status: "available",
  recentRequests: 8,
  recentRequestWindow: "five minutes",
  recognizedBotRequests: 0,
  topPagesAvailable: true,
  botActivityAvailable: true,
  daily: [
    { day: "2026-10-20", visitors: 5, pageViews: 9, requests: 12, threats: 0 },
  ],
  hourly: [
    { hour: "2026-10-21T10:00:00Z", visitors: 2, pageViews: 3, requests: 4 },
  ],
  countries: [{ country: "BD", requests: 30, threats: 0 }],
  countryReports: {
    daily: [{ country: "BD", requests: 2, threats: 1 }],
    weekly: [{ country: "BD", requests: 12, threats: 3 }],
    monthly: [{ country: "BD", requests: 30, threats: 5 }],
  },
  topPages: [],
  botActivity: [],
  sampled: true,
};

const interactions: SiteInteractionSnapshot = {
  status: "available",
  items: [],
  acquisition: { status: "available", items: [] },
};

const engagedSessions: SiteEngagedSessionsSnapshot = {
  status: "available",
  daily: [{ day: "2026-10-20", sessions: 3 }],
};

describe("country traffic report periods", () => {
  it("renders the three period controls with 30 days selected by default", () => {
    const html = renderToStaticMarkup(
      <AnalyticsDashboard snapshot={snapshot} interactions={interactions} engagedSessions={engagedSessions} report={getSiteAnalyticsReportRange("monthly", new Date("2026-10-23T12:00:00Z"))} onPeriodChange={() => {}} />,
    );
    expect(html).toContain("Last 30 available UTC days");
    expect(html).toContain("5 threat events");
    expect(html).toContain('aria-label="Country report period"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>30 days<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Daily<\/button>/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Weekly<\/button>/);
  });
});

describe("on-site report periods", () => {
  const render = (period: string, provider: CloudflareAnalyticsDashboard = snapshot) => renderToStaticMarkup(
    <AnalyticsDashboard snapshot={provider} interactions={interactions}
      engagedSessions={{ status: "available", daily: [{ day: "2026-10-22", sessions: 3 }, { day: "2026-10-23", sessions: 4 }] }}
      report={getSiteAnalyticsReportRange(period, new Date("2026-10-23T12:00:00Z"))} onPeriodChange={() => {}} />,
  );

  it.each([
    ["daily", "today", "23 Oct 2026 · UTC", "Daily"],
    ["weekly", "last 7 days", "17 Oct 2026 – 23 Oct 2026 · UTC", "Weekly"],
    ["monthly", "last 30 days", "24 Sept 2026 – 23 Oct 2026 · UTC", "Monthly"],
  ])("labels the %s report consistently across on-site panels", (period, description, range, button) => {
    const html = render(period);
    expect(html).toContain(`Likely human sessions · ${description}`);
    expect(html).toContain(`page area · ${description}`);
    expect(html).toContain(`landing page · ${description}`);
    expect(html).toContain(range);
    expect(html).toMatch(new RegExp(`<button[^>]*aria-pressed="true"[^>]*>${button}</button>`));
    expect(html).toContain("No consented interactions were collected in this period.");
    expect(html).toContain("No consented acquisition events were collected in this period.");
  });

  it("totals selected sessions and keeps reports available without Cloudflare", () => {
    const html = render("weekly", { status: "unavailable" });
    expect(html).toMatch(/Likely human sessions · last 7 days<\/p><p[^>]*>7<\/p>/);
    expect(html).toContain('aria-label="Interaction report period"');
    expect(html).toContain("Search traffic and lead signals");
  });

  it("contains screen-reader table layout and makes chart scrolling keyboard accessible", () => {
    const html = render("weekly");
    expect(html).not.toContain('<table class="sr-only">');
    expect(html.match(/<div class="sr-only"><table>/g)).toHaveLength(3);
    expect(html).toContain('tabindex="0" role="region" aria-label="Human-session chart, scroll horizontally"');
  });
});
