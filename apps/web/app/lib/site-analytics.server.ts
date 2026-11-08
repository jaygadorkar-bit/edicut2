import type { DatabaseClient } from "@edicut/db/client";
import { sql } from "drizzle-orm";
import { getSiteAnalyticsReportRange, siteAnalyticsReportDays } from "./site-analytics-report";
import { isConversionOnlyAnalyticsPath, isPublicAnalyticsPath, isSafeSiteAnalyticsLandingPath, SITE_ANALYTICS_REGIONS, SITE_ANALYTICS_SOURCES, SITE_ANALYTICS_EVENTS, type SiteAnalyticsDelta, type SiteAnalyticsRegion, type SiteAcquisitionDelta } from "./site-analytics";

export type SiteInteractionAggregate = SiteAnalyticsDelta & { pagePath: string };
export type SiteInteractionSnapshot = {
  status: "available" | "not-configured";
  items: SiteInteractionAggregate[];
  acquisition?: SiteAcquisitionSnapshot;
};

export type SiteAcquisitionSnapshot = {
  status: "available" | "not-configured";
  items: SiteAcquisitionDelta[];
};

export type SiteEngagedSessionsSnapshot = {
  status: "available" | "not-configured";
  daily: Array<{ day: string; sessions: number }>;
};

const validRegions = new Set<string>(SITE_ANALYTICS_REGIONS.map((region) => region.id));
const validSources = new Set<string>(SITE_ANALYTICS_SOURCES.map((source) => source.id));
const validEvents = new Set<string>(SITE_ANALYTICS_EVENTS.map((event) => event.id));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSafeCount(value: unknown, max: number) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : 0;
}

function safePublicPath(value: unknown, allowConversionOnly = false): string | null {
  if (typeof value !== "string" || value.length > 180 || !(allowConversionOnly ? isSafeSiteAnalyticsLandingPath(value) : isPublicAnalyticsPath(value))) return null;
  return value.split("/").map((segment) =>
    /^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) ? ":id" : segment,
  ).join("/");
}

/** Reject rather than retain raw campaign, referrer, customer, or private route data. */
export function normalizeAcquisitionBatch(body: unknown): SiteAcquisitionDelta[] | null {
  if (!isRecord(body) || !Array.isArray(body.acquisition) || body.acquisition.length < 1 || body.acquisition.length > 20) return null;
  const normalized = new Map<string, SiteAcquisitionDelta>();
  for (const raw of body.acquisition) {
    if (!isRecord(raw) || Object.keys(raw).some((key) => !["pagePath", "landingPath", "source", "event", "count"].includes(key))) return null;
    const pagePath = safePublicPath(raw.pagePath, raw.event === "quote_request");
    const landingPath = safePublicPath(raw.landingPath, true);
    if (!pagePath || !landingPath || typeof raw.source !== "string" || !validSources.has(raw.source) || typeof raw.event !== "string" || !validEvents.has(raw.event)) return null;
    if (isConversionOnlyAnalyticsPath(pagePath) && raw.event !== "quote_request") return null;
    if (typeof raw.count !== "number" || !Number.isSafeInteger(raw.count) || raw.count < 1 || raw.count > 20) return null;
    const item = { pagePath, landingPath, source: raw.source, event: raw.event, count: raw.count } as SiteAcquisitionDelta;
    const key = `${pagePath}\u0000${landingPath}\u0000${item.source}\u0000${item.event}`;
    const previous = normalized.get(key);
    normalized.set(key, previous ? { ...item, count: Math.min(20, previous.count + item.count) } : item);
  }
  return [...normalized.values()];
}

export function normalizeInteractionBatch(body: unknown): SiteInteractionAggregate[] | null {
  if (!isRecord(body) || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 20) return null;
  const normalized: SiteInteractionAggregate[] = [];

  for (const raw of body.events) {
    if (!isRecord(raw)) return null;
    const pagePath = typeof raw.pagePath === "string" ? raw.pagePath : "";
    const region = typeof raw.region === "string" ? raw.region : "";
    if (
      pagePath.length < 1 || pagePath.length > 180 || !pagePath.startsWith("/") ||
      pagePath.includes("?") || pagePath.includes("#") || pagePath.includes("\\") ||
      pagePath.startsWith("//") || !isPublicAnalyticsPath(pagePath) || !validRegions.has(region)
    ) return null;

    const safePagePath = pagePath.split("/").map((segment) =>
      /^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment) || /^[^/]*@[^/]*$/.test(segment)
        ? ":id"
        : segment,
    ).join("/");
    const delta: SiteInteractionAggregate = {
      pagePath: safePagePath,
      region: region as SiteAnalyticsRegion,
      hoverCount: toSafeCount(raw.hoverCount, 100),
      clickCount: toSafeCount(raw.clickCount, 100),
      dwellMs: toSafeCount(raw.dwellMs, 180_000),
    };
    if (delta.hoverCount + delta.clickCount + delta.dwellMs > 0) normalized.push(delta);
  }

  return normalized.length ? normalized : null;
}

function resultRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result.filter(isRecord);
  if (!isRecord(result)) return [];
  const rows = Array.isArray(result.rows) ? result.rows : Array.isArray(result.results) ? result.results : [];
  return rows.filter(isRecord);
}

export async function writeSiteInteractionAggregates(db: DatabaseClient, items: SiteInteractionAggregate[], now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const values = items.map((item) => sql`(
    ${day}::date, ${item.pagePath}, ${item.region}, ${item.hoverCount}, ${item.clickCount}, ${item.dwellMs}, now()
  )`);

  await db.execute(sql`
    INSERT INTO public.site_analytics_interactions_daily
      (day, page_path, region, hover_count, click_count, dwell_ms, updated_at)
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (day, page_path, region) DO UPDATE SET
      hover_count = site_analytics_interactions_daily.hover_count + EXCLUDED.hover_count,
      click_count = site_analytics_interactions_daily.click_count + EXCLUDED.click_count,
      dwell_ms = site_analytics_interactions_daily.dwell_ms + EXCLUDED.dwell_ms,
      updated_at = now()
  `);
}

export async function writeSiteAcquisitionAggregates(db: DatabaseClient, items: SiteAcquisitionDelta[], now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const values = items.map((item) => sql`(
    ${day}::date, ${item.pagePath}, ${item.landingPath}, ${item.source}, ${item.event}, ${item.count}, now()
  )`);
  await db.execute(sql`
    INSERT INTO public.site_analytics_acquisition_daily (day, page_path, landing_path, source, event, event_count, updated_at)
    VALUES ${sql.join(values, sql`, `)}
    ON CONFLICT (day, page_path, landing_path, source, event) DO UPDATE SET
      event_count = site_analytics_acquisition_daily.event_count + EXCLUDED.event_count,
      updated_at = now()
  `);
}

/** Store only a daily total; no browser, visitor, IP, or session identifiers are retained. */
export async function writeSiteEngagedSession(db: DatabaseClient, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  await db.execute(sql`
    INSERT INTO public.site_analytics_engaged_sessions_daily (day, session_count, updated_at)
    VALUES (${day}::date, 1, now())
    ON CONFLICT (day) DO UPDATE SET
      session_count = site_analytics_engaged_sessions_daily.session_count + 1,
      updated_at = now()
  `);
}

export async function getSiteEngagedSessionsSnapshot(db: DatabaseClient, report = getSiteAnalyticsReportRange()): Promise<SiteEngagedSessionsSnapshot> {
  try {
    const result = await db.execute(sql`
      SELECT day::text AS day, session_count::bigint AS sessions
      FROM public.site_analytics_engaged_sessions_daily
      WHERE day >= ${report.startDay}::date AND day < ${report.endExclusiveDay}::date
      ORDER BY day ASC
    `);
    const counts = new Map<string, number>();
    for (const row of resultRows(result)) {
      if (typeof row.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.day)) continue;
      const sessions = Number(row.sessions);
      if (Number.isSafeInteger(sessions) && sessions >= 0) counts.set(row.day, sessions);
    }
    const daily = siteAnalyticsReportDays(report).map((day) => ({ day, sessions: counts.get(day) ?? 0 }));
    return { status: "available", daily };
  } catch {
    return { status: "not-configured", daily: [] };
  }
}

export async function getSiteAcquisitionSnapshot(db: DatabaseClient, report = getSiteAnalyticsReportRange()): Promise<SiteAcquisitionSnapshot> {
  try {
    const result = await db.execute(sql`
      SELECT page_path AS "pagePath", landing_path AS "landingPath", source, event, sum(event_count)::bigint AS count
      FROM public.site_analytics_acquisition_daily
      WHERE day >= ${report.startDay}::date AND day < ${report.endExclusiveDay}::date
      GROUP BY page_path, landing_path, source, event
      ORDER BY sum(event_count) DESC
      LIMIT 500
    `);
    const items = resultRows(result).flatMap((row) => {
      if (typeof row.pagePath !== "string" || typeof row.landingPath !== "string" || typeof row.source !== "string" || !validSources.has(row.source) || typeof row.event !== "string" || !validEvents.has(row.event)) return [];
      const count = Number(row.count);
      if (!Number.isSafeInteger(count) || count < 0) return [];
      return [{ pagePath: row.pagePath, landingPath: row.landingPath, source: row.source, event: row.event, count } as SiteAcquisitionDelta];
    });
    return { status: "available", items };
  } catch {
    return { status: "not-configured", items: [] };
  }
}

export async function getSiteInteractionSnapshot(db: DatabaseClient, report = getSiteAnalyticsReportRange()): Promise<SiteInteractionSnapshot> {
  const acquisition = await getSiteAcquisitionSnapshot(db, report);
  try {
    const result = await db.execute(sql`
      SELECT page_path AS "pagePath", region,
        sum(hover_count)::bigint AS "hoverCount",
        sum(click_count)::bigint AS "clickCount",
        sum(dwell_ms)::bigint AS "dwellMs"
      FROM public.site_analytics_interactions_daily
      WHERE day >= ${report.startDay}::date AND day < ${report.endExclusiveDay}::date
      GROUP BY page_path, region
      ORDER BY sum(hover_count) DESC, sum(click_count) DESC
      LIMIT 200
    `);

    const items = resultRows(result).flatMap((row) => {
      if (typeof row.pagePath !== "string" || typeof row.region !== "string" || !validRegions.has(row.region)) return [];
      const asCount = (value: unknown) => {
        const count = typeof value === "number" ? value : Number(value);
        return Number.isFinite(count) && count >= 0 ? Math.round(count) : 0;
      };
      return [{
        pagePath: row.pagePath,
        region: row.region as SiteAnalyticsRegion,
        hoverCount: asCount(row.hoverCount),
        clickCount: asCount(row.clickCount),
        dwellMs: asCount(row.dwellMs),
      }];
    });

    return { status: "available", items, acquisition };
  } catch {
    // The migration is intentionally not auto-applied; until it is installed, show a clear setup state.
    return { status: "not-configured", items: [], acquisition };
  }
}
