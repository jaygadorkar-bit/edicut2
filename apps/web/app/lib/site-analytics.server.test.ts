import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  getSiteInteractionSnapshot,
  getSiteAcquisitionSnapshot,
  getSiteEngagedSessionsSnapshot,
  normalizeAcquisitionBatch,
  normalizeInteractionBatch,
  writeSiteAcquisitionAggregates,
  writeSiteInteractionAggregates,
} from "./site-analytics.server";
import { classifySiteAnalyticsSource, isConversionOnlyAnalyticsPath, isPublicAnalyticsPath } from "./site-analytics";
import { getSiteAnalyticsReportRange } from "./site-analytics-report";

describe("consented interaction analytics", () => {
  it("accepts bounded area counts and removes excessive client values", () => {
    const batch = normalizeInteractionBatch({ events: [{
      pagePath: "/pricing/123",
      region: "pricing",
      hoverCount: 1_000,
      clickCount: 2,
      dwellMs: 500_000,
    }] });

    expect(batch).toEqual([{
      pagePath: "/pricing/:id",
      region: "pricing",
      hoverCount: 100,
      clickCount: 2,
      dwellMs: 180_000,
    }]);
  });

  it.each([
    { events: [{ pagePath: "/site/node-logmin", region: "navigation", hoverCount: 1 }] },
    { events: [{ pagePath: "/dashboard/projects/private-project", region: "page-content", hoverCount: 1 }] },
    { events: [{ pagePath: "/checkout/basic", region: "page-content", hoverCount: 1 }] },
    { events: [{ pagePath: "/pricing?email=private@example.com", region: "pricing", hoverCount: 1 }] },
    { events: [{ pagePath: "/pricing", region: "unknown-selector", hoverCount: 1 }] },
    { events: Array.from({ length: 21 }, () => ({ pagePath: "/", region: "hero", hoverCount: 1 })) },
  ])("rejects admin paths, query strings, unknown areas, and oversized batches", (body) => {
    expect(normalizeInteractionBatch(body)).toBeNull();
  });

  it("writes aggregates with an atomic daily upsert", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    await writeSiteInteractionAggregates({ execute } as never, [{
      pagePath: "/",
      region: "hero",
      hoverCount: 2,
      clickCount: 1,
      dwellMs: 3_500,
    }], new Date("2026-10-16T12:00:00Z"));

    expect(execute).toHaveBeenCalledOnce();
    const query = execute.mock.calls[0][0];
    expect(new PgDialect().sqlToQuery(query).sql).toContain("ON CONFLICT");
  });

  it("returns only limited aggregates and marks an uninstalled migration clearly", async () => {
    const execute = vi.fn().mockResolvedValue([
      { pagePath: "/", region: "hero", hoverCount: "12", clickCount: "3", dwellMs: "54000" },
      { pagePath: "/", region: "unknown", hoverCount: 99, clickCount: 99, dwellMs: 99 },
    ]);
    await expect(getSiteInteractionSnapshot({ execute } as never)).resolves.toEqual({
      status: "available",
      items: [{ pagePath: "/", region: "hero", hoverCount: 12, clickCount: 3, dwellMs: 54_000 }],
      acquisition: { status: "available", items: [] },
    });

    execute.mockRejectedValue(new Error("relation does not exist"));
    await expect(getSiteInteractionSnapshot({ execute } as never)).resolves.toEqual({ status: "not-configured", items: [], acquisition: { status: "not-configured", items: [] } });
  });
});

describe("period-filtered on-site reports", () => {
  it.each(["daily", "weekly", "monthly"])("bounds every %s read to the same parameterized UTC dates", async (period) => {
    const report = getSiteAnalyticsReportRange(period, new Date("2026-10-23T12:00:00Z"));
    const execute = vi.fn().mockResolvedValue([]);
    await getSiteInteractionSnapshot({ execute } as never, report);
    await getSiteEngagedSessionsSnapshot({ execute } as never, report);
    expect(execute).toHaveBeenCalledTimes(3);
    const statements = execute.mock.calls.map(([statement]) => new PgDialect().sqlToQuery(statement));
    for (const query of statements) {
      expect(query.sql).toMatch(/WHERE day >= \$1::date AND day < \$2::date/);
      expect(query.params).toEqual([report.startDay, report.endExclusiveDay]);
      expect(query.sql).not.toContain("CURRENT_DATE");
    }
    expect(statements[0].sql).toContain("LIMIT 500");
    expect(statements[1].sql).toContain("LIMIT 200");
  });

  it("zero fills missing days and excludes stale/future/invalid session totals", async () => {
    const execute = vi.fn().mockResolvedValue([
      { day: "2026-10-17", sessions: "3" }, { day: "2026-10-23", sessions: 4 },
      { day: "2026-10-16", sessions: 99 }, { day: "2026-10-24", sessions: 99 },
      { day: "2026-10-21", sessions: -1 }, { day: "2026-10-20", sessions: "9007199254740992" },
    ]);
    const result = await getSiteEngagedSessionsSnapshot({ execute } as never, getSiteAnalyticsReportRange("weekly", new Date("2026-10-23T12:00:00Z")));
    expect(result.status).toBe("available");
    expect(result.daily).toHaveLength(7);
    expect(result.daily.reduce((sum, day) => sum + day.sessions, 0)).toBe(7);
    expect(result.daily[1]).toEqual({ day: "2026-10-18", sessions: 0 });
  });

  it("does not mistake an old session count for today's report", async () => {
    const execute = vi.fn().mockResolvedValue([{ day: "2026-10-22", sessions: 9 }]);
    await expect(getSiteEngagedSessionsSnapshot({ execute } as never, getSiteAnalyticsReportRange("daily", new Date("2026-10-23T00:00:00Z")))).resolves.toEqual({
      status: "available", daily: [{ day: "2026-10-23", sessions: 0 }],
    });
  });
});

describe("consented acquisition analytics", () => {
  const signal = { pagePath: "/contact", landingPath: "/services/youtube-video-editing", source: "organic_search", event: "contact_inquiry", count: 1 };

  it.each([
    ["https://www.google.com/search?q=private+search", "", "organic_search"],
    ["https://www.google.co.uk/search?q=private", "", "organic_search"],
    ["https://www.google.evil.com/", "", "referral"],
    ["https://www.bing.com/search?q=private", "", "organic_search"],
    ["https://l.facebook.com/private", "", "social"],
    ["https://edicut.com/pricing?email=private@example.com", "", "direct"],
    ["", "?utm_medium=email&utm_campaign=private@example.com", "email"],
    ["https://google.com", "?utm_medium=cpc", "paid_search"],
    ["", "?utm_medium=custom-private-value", "other_campaign"],
    ["not a URL", "", "direct"],
  ])("classifies source locally without persisting URL values", (referrer, search, expected) => {
    expect(classifySiteAnalyticsSource(referrer, "https://edicut.com", search)).toBe(expected);
  });

  it("accepts only public page paths and fixed event/source labels", () => {
    expect(isPublicAnalyticsPath("/services")).toBe(true);
    expect(normalizeAcquisitionBatch({ acquisition: [signal] })).toEqual([signal]);
    expect(normalizeAcquisitionBatch({ acquisition: [signal, signal] })).toEqual([{ ...signal, count: 2 }]);
  });

  it("accepts quote confirmation totals on the conversion-only route without allowing its page views", () => {
    const quote = { ...signal, pagePath: "/custom-quote", landingPath: "/", event: "quote_request" };
    expect(isConversionOnlyAnalyticsPath("/custom-quote")).toBe(true);
    expect(normalizeAcquisitionBatch({ acquisition: [quote] })).toEqual([quote]);
    expect(normalizeAcquisitionBatch({ acquisition: [{ ...quote, event: "page_view" }] })).toBeNull();
    expect(normalizeAcquisitionBatch({ acquisition: [{ ...quote, pagePath: "/checkout/basic", event: "quote_request" }] })).toBeNull();
    expect(normalizeAcquisitionBatch({ acquisition: [{ ...quote, landingPath: "/custom-quote?submitted=private" }] })).toBeNull();
  });

  it.each([
    { ...signal, source: "private@example.com" },
    { ...signal, event: "purchase-customer-123" },
    { ...signal, landingPath: "/?email=private@example.com" },
    { ...signal, pagePath: "/dashboard/projects/private" },
    { ...signal, pagePath: "/services/private@example.com" },
    { ...signal, referrer: "https://google.com/?q=private" },
    { ...signal, count: 0 },
    { ...signal, count: 21 },
  ])("rejects private data, arbitrary labels, and unbounded counts", (invalid) => {
    expect(normalizeAcquisitionBatch({ acquisition: [invalid] })).toBeNull();
  });

  it("uses parameterized atomic daily aggregates without visitor identifiers", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const normalized = normalizeAcquisitionBatch({ acquisition: [signal] })!;
    await writeSiteAcquisitionAggregates({ execute } as never, normalized, new Date("2026-10-19T12:00:00Z"));
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("ON CONFLICT (day, page_path, landing_path, source, event)");
    expect(query.params).toEqual(["2026-10-19", "/contact", "/services/youtube-video-editing", "organic_search", "contact_inquiry", 1]);
  });

  it("keeps interaction reporting available when acquisition migration is absent", async () => {
    const execute = vi.fn().mockRejectedValueOnce(new Error("missing acquisition table")).mockResolvedValueOnce([
      { pagePath: "/", region: "hero", hoverCount: 1, clickCount: 2, dwellMs: 300 },
    ]);
    await expect(getSiteInteractionSnapshot({ execute } as never)).resolves.toMatchObject({
      status: "available", items: [{ pagePath: "/" }], acquisition: { status: "not-configured", items: [] },
    });
  });

  it("returns only known source and event aggregates", async () => {
    const execute = vi.fn().mockResolvedValue([{ ...signal, count: "3" }, { ...signal, source: "untrusted", count: 4 }]);
    await expect(getSiteAcquisitionSnapshot({ execute } as never)).resolves.toEqual({ status: "available", items: [{ ...signal, count: 3 }] });
  });
});
