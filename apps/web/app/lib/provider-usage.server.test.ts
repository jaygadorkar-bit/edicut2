import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), driveQuota: vi.fn(), localEnvFile: "" }));
vi.mock("@edicut/shared/server-fetch", () => ({ fetchWithTimeout: mocks.fetch }));
vi.mock("./google-drive-storage.server", () => ({ getGoogleDriveStorageQuota: mocks.driveQuota }));
vi.mock("node:fs/promises", () => ({ readFile: async (path: string) => {
  if (String(path).endsWith(".env.cloudflare") && mocks.localEnvFile) return mocks.localEnvFile;
  throw new Error("No local files in this fixture");
} }));
import { getCloudflareAnalyticsDashboard, getCloudflareSecurityLog, getCloudflareTrafficSnapshot, getProviderUsageOverview } from "./provider-usage.server";

const env = Object.fromEntries([
  "CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID", "CF_ZONE_ID", "CLOUDFLARE_ZONE_NAME", "CLOUDFLARE_WORKER_NAME",
  "CLOUDFLARE_API_TOKEN", "CF_API_TOKEN", "CLOUDFLARE_ACCOUNT_ANALYTICS_API_TOKEN", "CLOUDFLARE_MASTER_API_TOKEN", "CLOUDFLARE_EMAIL", "CF_EMAIL", "CLOUDFLARE_API_KEY", "CF_API_KEY", "VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_ORG_ID",
  "SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY",
].map(key => [key, ""]));
const context = { cf: { env: { ...env, SUPABASE_PROJECT_REF: "test-project", SUPABASE_ACCESS_TOKEN: "test-management-token" } } };
const driveEnvironmentKeys = ["GOOGLE_DRIVE_ACCOUNT_EMAIL", "YOUTUBE_OAUTH_CLIENT_ID", "YOUTUBE_OAUTH_CLIENT_SECRET", "YOUTUBE_TOKEN_SECRET"];
let previousDriveEnvironment: Record<string, string | undefined> = {};
beforeEach(() => {
  previousDriveEnvironment = Object.fromEntries(driveEnvironmentKeys.map(key => [key, process.env[key]]));
  for (const key of driveEnvironmentKeys) delete process.env[key];
  vi.clearAllMocks(); mocks.localEnvFile = ""; mocks.driveQuota.mockResolvedValue({ status: "not-connected" });
});
afterEach(() => {
  for (const key of driveEnvironmentKeys) {
    const value = previousDriveEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("fresh infrastructure usage", () => {
  it("reads updated provider usage on every request and keeps credentials out of the result", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ result: [{ total_rest_requests: 1 }] })).mockResolvedValueOnce(Response.json({ result: [{ total_rest_requests: 2 }] }));
    const first = await getProviderUsageOverview(context, null, null, {} as DatabaseClient);
    const second = await getProviderUsageOverview(context, null, null, {} as DatabaseClient);
    expect(first.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "REST requests (today)")?.value).toBe("1");
    expect(second.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "REST requests (today)")?.value).toBe("2");
    expect(second.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "Database disk allocation")?.value).toBe("No live total-disk meter · 1 GB / project");
    expect(second.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "API request allowance")?.value).toBe("2 requests today · Unlimited reference");
    expect(second.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "Realtime messages / month")?.value).toBe("No live meter · 2 million / org reference");
    expect(second.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "Concurrent Realtime connections")?.value).toBe("No live meter · 200 / project reference");
    expect(second.find(provider => provider.id === "supabase")?.cards.find(card => card.label === "Realtime messages per second")?.value).toBe("No live meter · 100 / project reference");
    expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(JSON.stringify(second)).not.toContain("test-management-token");
    for (const [, options] of mocks.fetch.mock.calls) expect(options.cache).toBe("no-store");
  });
  it("starts live database reads while other provider requests are pending", async () => {
    let finish!: (response: Response) => void;
    mocks.fetch.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    const execute = vi.fn().mockResolvedValue([{ database_name: "fixture", database_bytes: "1024", active_connections: "1", max_connections: "100", user_tables: "2", postgres_version: "17" }]);
    const pending = getProviderUsageOverview(context, null, null, { execute } as unknown as DatabaseClient);
    try { await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce()); }
    finally { finish(Response.json({ result: [] })); }
    const providers = await pending;
    const supabase = providers.find(provider => provider.id === "supabase");
    expect(providers.map(provider => String(provider.id))).not.toContain("neon");
    expect(supabase?.cards.find(card => card.label === "Postgres database storage")?.value).toBe("1.0 KB / 500 MB");
    expect(supabase?.cards.find(card => card.label === "Postgres database storage")?.meterPercent).toBeGreaterThan(0);
    expect(supabase?.cards.find(card => card.label === "Postgres connections")?.value).toBe("1 / 100");
    expect(supabase?.cards.find(card => card.label === "Postgres user tables")?.value).toBe("2");
    expect(supabase?.cards.find(card => card.label === "Database disk allocation")?.value).toBe("1.0 KB database size · 1 GB disk reference");
    expect(supabase?.cards.find(card => card.label === "Uncached egress allowance")?.value).toBe("No live meter · 5 GB / org / billing cycle");
    expect(supabase?.cards.find(card => card.label === "Cached egress allowance")?.help).toContain("not normal Postgres query traffic");
  });

  it("shows account storage, available space, and Drive-only file usage separately", async () => {
    mocks.driveQuota.mockResolvedValue({
      status: "connected",
      quota: {
        accountUsageBytes: 1.25 * 1024 ** 4,
        driveUsageBytes: 250 * 1024 ** 3,
        limitBytes: 5 * 1024 ** 4,
      },
    });
    const providers = await getProviderUsageOverview(context, null, null, {} as DatabaseClient);
    const drive = providers.find(provider => provider.id === "google-drive");

    expect(drive?.status).toBe("connected");
    expect(drive?.cards.find(card => card.label === "Google storage used")?.value).toBe("1.3 TB / 5.0 TB");
    expect(drive?.cards.find(card => card.label === "Free for Drive uploads")?.value).toBe("3.8 TB");
    expect(drive?.cards.find(card => card.label === "Files in Drive")?.value).toBe("250.0 GB");
    expect(drive?.cards.find(card => card.label === "Download bandwidth")?.value).toBe("No live meter");
    expect(drive?.cards.find(card => card.label === "Download bandwidth")?.help).toContain("1 TB of API egress per project per day");
    expect(drive?.cards.find(card => card.label === "Google storage used")?.meterPercent).toBe(25);
  });

  it("keeps Drive quota failures visible without failing the infrastructure overview", async () => {
    mocks.driveQuota.mockResolvedValue({ status: "unavailable" });
    const providers = await getProviderUsageOverview(context, null, null, {} as DatabaseClient);
    const drive = providers.find(provider => provider.id === "google-drive");

    expect(drive?.status).toBe("partial");
    expect(drive?.statusLabel).toBe("Usage unavailable");
    expect(drive?.cards.filter(card => card.label !== "Download bandwidth").every(card => card.value === "Unavailable")).toBe(true);
    expect(drive?.cards.find(card => card.label === "Download bandwidth")?.value).toBe("No live meter");
  });

  it("passes local Drive OAuth configuration to the quota reader", async () => {
    mocks.localEnvFile = [
      "GOOGLE_DRIVE_ACCOUNT_EMAIL=storage@example.test",
      "YOUTUBE_OAUTH_CLIENT_ID=drive-client-id",
      "YOUTUBE_OAUTH_CLIENT_SECRET=drive-client-secret",
      "YOUTUBE_TOKEN_SECRET=drive-token-secret-that-is-long-enough",
      "APP_URL=http://localhost:3002",
    ].join("\n");

    await getProviderUsageOverview(context, null, null, {} as DatabaseClient);

    const resolvedContext = mocks.driveQuota.mock.calls[0][1];
    expect(resolvedContext.cf.env).toMatchObject({
      GOOGLE_DRIVE_ACCOUNT_EMAIL: "storage@example.test",
      YOUTUBE_OAUTH_CLIENT_ID: "drive-client-id",
      YOUTUBE_OAUTH_CLIENT_SECRET: "drive-client-secret",
      YOUTUBE_TOKEN_SECRET: "drive-token-secret-that-is-long-enough",
      APP_URL: "http://localhost:3002",
    });
  });

  it("uses the account analytics credential for Worker and D1 metrics while preserving the zone token", async () => {
    const zoneAnalytics = {
      data: { viewer: { zones: [{ httpRequests1dGroups: [{
        sum: { requests: 3, bytes: 1200, cachedRequests: 1, cachedBytes: 300 },
        uniq: { uniques: 2 },
      }] }] } },
    };
    const workerAnalytics = {
      data: { viewer: { accounts: [{ workersInvocationsAdaptive: [{ sum: { requests: 4, errors: 1, subrequests: 5 } }] }] } },
    };
    const d1Analytics = {
      data: { viewer: { accounts: [{
        d1AnalyticsAdaptiveGroups: [{ sum: { rowsRead: 12, rowsWritten: 3 }, dimensions: { databaseId: "db-1" } }],
        d1StorageAdaptiveGroups: [{ max: { databaseSizeBytes: 2048 }, dimensions: { databaseId: "db-1" } }],
      }] } },
    };
    mocks.fetch
      .mockResolvedValueOnce(Response.json({ result: [{ id: "test-zone", name: "edicut.test" }] }))
      .mockResolvedValueOnce(Response.json(zoneAnalytics))
      .mockResolvedValueOnce(Response.json(workerAnalytics))
      .mockResolvedValueOnce(Response.json(d1Analytics));
    const scopedContext = { cf: { env: {
      ...env,
      CLOUDFLARE_API_TOKEN: "zone-only-token",
      CLOUDFLARE_ACCOUNT_ANALYTICS_API_TOKEN: "account-analytics-token",
      CLOUDFLARE_ACCOUNT_ID: "test-account",
      CLOUDFLARE_ZONE_ID: "test-zone",
      CLOUDFLARE_WORKER_NAME: "edicut-worker",
    } } };

    const providers = await getProviderUsageOverview(scopedContext, null, null, {} as DatabaseClient);
    const cloudflare = providers.find(provider => provider.id === "cloudflare");
    const d1 = providers.find(provider => provider.id === "cloudflare-d1");
    const requests = mocks.fetch.mock.calls;

    expect(cloudflare?.cards.find(card => card.label === "Worker invocations (today UTC)")?.value).toContain("4");
    expect(d1?.cards.find(card => card.label === "Rows read (today UTC)")?.value).toContain("12");
    expect(requests[1][1].headers.Authorization).toBe("Bearer zone-only-token");
    expect(requests[2][1].headers.Authorization).toBe("Bearer account-analytics-token");
    expect(requests[3][1].headers.Authorization).toBe("Bearer account-analytics-token");
    expect(JSON.stringify(providers)).not.toContain("account-analytics-token");
  });
});

describe("Cloudflare recent traffic snapshot", () => {
  it("returns recent request and recognized bot counts without exposing credentials", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ data: [{ request_count: 40, recognized_bot_requests: 3 }], rows: 1 }));

    const snapshot = await getCloudflareTrafficSnapshot({ cf: { env: {
      CLOUDFLARE_API_TOKEN: "test-cf-token",
      CLOUDFLARE_ZONE_ID: "traffic-test-zone",
    } } });

    expect(snapshot).toEqual({ status: "available", recentRequests: 40, recognizedBotRequests: 3 });
    expect(JSON.stringify(snapshot)).not.toContain("test-cf-token");
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][0]).toBe("https://api.cloudflare.com/client/v4/analytics/sql");
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(request.scope).toEqual({ zoneTag: "traffic-test-zone" });
    expect(request.query).toContain("FROM events.httpRequests");
    expect(request.query).toContain("timestamp >= NOW() - INTERVAL '5' MINUTE");
  });

  it("does not call Cloudflare when credentials or a zone are missing", async () => {
    await expect(getCloudflareTrafficSnapshot({ cf: { env: {
      CLOUDFLARE_API_TOKEN: "",
      CF_API_TOKEN: "",
      CLOUDFLARE_EMAIL: "",
      CF_EMAIL: "",
      CLOUDFLARE_API_KEY: "",
      CF_API_KEY: "",
    } } })).resolves.toEqual({ status: "not-configured" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("surfaces a missing Cloudflare analytics permission without exposing provider errors", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ errors: [{ message: "zone does not have access to analytics" }] }));
    const snapshot = await getCloudflareTrafficSnapshot({ cf: { env: {
      CLOUDFLARE_API_TOKEN: "test-cf-token",
      CLOUDFLARE_ZONE_ID: "traffic-permission-test-zone",
    } } });

    expect(snapshot).toEqual({ status: "permission-required" });
    expect(JSON.stringify(snapshot)).not.toContain("does not have access");
  });
});

describe("Cloudflare analytics dashboard", () => {
  it("returns sampled visitor trends, country totals, page paths, and classified bot activity", async () => {
    mocks.fetch
      .mockResolvedValueOnce(Response.json({ data: { viewer: { zones: [{
        hourly: [{ dimensions: { datetime: "2026-10-16T13:00:00Z" }, sum: { requests: 11, pageViews: 4 }, uniq: { uniques: 3 } }],
        daily: [
          { dimensions: { date: "2026-10-15" }, sum: { requests: 20, pageViews: 8, threats: 1, countryMap: [{ clientCountryName: "BD", requests: 8, threats: 1 }] }, uniq: { uniques: 5 } },
          { dimensions: { date: "2026-10-16" }, sum: { requests: 30, pageViews: 12, threats: 0, countryMap: [{ clientCountryName: "BD", requests: 10, threats: 0 }, { clientCountryName: "US", requests: 4, threats: 0 }] }, uniq: { uniques: 9 } },
        ],
      }] } } }))
      .mockResolvedValueOnce(Response.json({ data: [
        { path: "/pricing", requests: 10, errors: 1 },
        { path: "/checkout/creator", requests: 20, errors: 0 },
      ] }))
      .mockResolvedValueOnce(Response.json({ data: [
        { userAgent: "GPTBot/1.0 private-version", path: "/robots.txt", status: 403, requests: 2 },
        { userAgent: "GPTBot/1.0", path: "/reset/private%40example.com/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef", status: 404, requests: 1 },
      ] }))
      .mockResolvedValueOnce(Response.json({ data: [{ request_count: 40, recognized_bot_requests: 3 }] }));

    const snapshot = await getCloudflareAnalyticsDashboard({ cf: { env: {
      CLOUDFLARE_API_TOKEN: "test-cf-token",
      CLOUDFLARE_ZONE_ID: "analytics-detail-test-zone",
    } } });

    expect(snapshot).toEqual({
      status: "available",
      recentRequests: 40,
      recentRequestWindow: "five minutes",
      recognizedBotRequests: 3,
      topPagesAvailable: true,
      botActivityAvailable: true,
      daily: [
        { day: "2026-10-15", visitors: 5, pageViews: 8, requests: 20, threats: 1 },
        { day: "2026-10-16", visitors: 9, pageViews: 12, requests: 30, threats: 0 },
      ],
      hourly: [{ hour: "2026-10-16T13:00:00Z", visitors: 3, pageViews: 4, requests: 11 }],
      countries: [{ country: "BD", requests: 18, threats: 1 }, { country: "US", requests: 4, threats: 0 }],
      countryReports: {
        daily: [{ country: "BD", requests: 10, threats: 0 }, { country: "US", requests: 4, threats: 0 }],
        weekly: [{ country: "BD", requests: 18, threats: 1 }, { country: "US", requests: 4, threats: 0 }],
        monthly: [{ country: "BD", requests: 18, threats: 1 }, { country: "US", requests: 4, threats: 0 }],
      },
      topPages: [{ path: "/pricing", requests: 10, errors: 1 }],
      botActivity: [
        { bot: "OpenAI crawler", path: "/robots.txt", status: 403, requests: 2 },
        { bot: "OpenAI crawler", path: "/reset/:id/:id", status: 404, requests: 1 },
      ],
      sampled: true,
    });
    expect(JSON.stringify(snapshot)).not.toContain("private-version");
    expect(JSON.stringify(snapshot)).not.toContain("private@example.com");
    expect(JSON.stringify(snapshot)).not.toContain("eyJhbGci");
    expect(mocks.fetch).toHaveBeenCalledTimes(4);
    const graphRequest = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(graphRequest.query).toContain("httpRequests1hGroups");
    expect(graphRequest.query).toContain("countryMap");
    for (const [, init] of [mocks.fetch.mock.calls[1], mocks.fetch.mock.calls[2]]) {
      expect(JSON.parse(init.body).scope).toEqual({ zoneTag: "analytics-detail-test-zone" });
    }
  });

  it("keeps hourly and daily charts when the five-minute SQL permission is missing", async () => {
    mocks.fetch
      .mockResolvedValueOnce(Response.json({ data: { viewer: { zones: [{
        hourly: [{ dimensions: { datetime: "2026-10-16T13:00:00Z" }, sum: { requests: 7, pageViews: 2 }, uniq: { uniques: 3 } }],
        daily: [{ dimensions: { date: "2026-10-16" }, sum: { requests: 12, pageViews: 4, threats: 0, countryMap: [] }, uniq: { uniques: 5 } }],
      }] } } }))
      .mockResolvedValueOnce(Response.json({ errors: [{ message: "SQL analytics access is missing" }] }))
      .mockResolvedValueOnce(Response.json({ data: [{ userAgent: "GPTBot", path: "/robots.txt", status: 200, requests: 2 }] }))
      .mockResolvedValueOnce(Response.json({ errors: [{ message: "zone does not have access to analytics" }] }));

    const snapshot = await getCloudflareAnalyticsDashboard({ cf: { env: {
      CLOUDFLARE_API_TOKEN: "test-cf-token",
      CLOUDFLARE_ZONE_ID: "analytics-detail-permission-zone",
    } } });

    expect(snapshot).toEqual({
      status: "available",
      recentRequests: 7,
      recentRequestWindow: "current hour",
      recognizedBotRequests: undefined,
      topPagesAvailable: false,
      botActivityAvailable: true,
      daily: [{ day: "2026-10-16", visitors: 5, pageViews: 4, requests: 12, threats: 0 }],
      hourly: [{ hour: "2026-10-16T13:00:00Z", visitors: 3, pageViews: 2, requests: 7 }],
      countries: [],
      countryReports: { daily: [], weekly: [], monthly: [] },
      topPages: [],
      botActivity: [{ bot: "OpenAI crawler", path: "/robots.txt", status: 200, requests: 2 }],
      sampled: true,
    });
  });
});

describe("Cloudflare security logs", () => {
  it("loads sampled HTTP error records for a selected period and removes request identifiers", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ data: [
      { timestamp: "2026-10-22T12:30:00Z", path: "/reset/123?token=private-value", status: "500", origin_status: 502, ray_id: "abcdef1234567890", security_action: "block" },
      { timestamp: "not-a-date", path: "/broken", status: 404, origin_status: 404, ray_id: "fedcba0987654321" },
    ] }));

    const snapshot = await getCloudflareSecurityLog({ cf: { env: {
      CLOUDFLARE_API_TOKEN: "test-security-token",
      CLOUDFLARE_ZONE_ID: "security-error-zone",
    } } }, "errors", "7d");

    expect(snapshot).toMatchObject({
      kind: "errors",
      status: "available",
      range: "7d",
      sampled: true,
      events: [{ timestamp: "2026-10-22T12:30:00.000Z", path: "/reset/:id", status: 500, originStatus: 502, rayId: "abcdef1234567890", securityAction: "block" }],
    });
    expect(JSON.stringify(snapshot)).not.toContain("private-value");
    expect(JSON.stringify(snapshot)).not.toContain("test-security-token");
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(request.scope).toEqual({ zoneTag: "security-error-zone" });
    expect(request.query).toContain("edgeResponseStatus >= 400");
    expect(request.query).toContain("INTERVAL '7' DAY");
    expect(request.query).not.toContain("clientIP");
    expect(request.query).not.toContain("clientRequestMethod");
    expect(request.query).toContain("rayId");
    expect(request.query).toContain("originResponseStatus");
  });

  it("loads firewall actions without requesting IP addresses, query strings, or user agents", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ data: { viewer: { zones: [{ firewallEventsAdaptive: [
      { action: "managed_challenge", source: "waf", datetime: "2026-10-22T12:25:00Z", clientCountryName: "BD", clientRequestPath: "/search?email=private%40example.test" },
    ] }] } } }));

    const snapshot = await getCloudflareSecurityLog({ cf: { env: {
      CLOUDFLARE_API_TOKEN: "test-threat-token",
      CLOUDFLARE_ZONE_ID: "security-threat-zone",
    } } }, "threats", "24h");

    expect(snapshot).toMatchObject({
      kind: "threats",
      status: "available",
      range: "24h",
      sampled: true,
      events: [{ timestamp: "2026-10-22T12:25:00.000Z", path: "/search", action: "managed_challenge", source: "waf", country: "BD" }],
    });
    expect(JSON.stringify(snapshot)).not.toContain("private@example.test");
    expect(JSON.stringify(snapshot)).not.toContain("test-threat-token");
    const request = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(request.query).toContain("firewallEventsAdaptive");
    expect(request.query).not.toContain("clientIP");
    expect(request.query).not.toContain("clientRequestQuery");
    expect(request.query).not.toContain("userAgent");
    expect(request.variables.filter.datetime_geq).toBeTruthy();
  });

  it("returns a safe permission state when Cloudflare denies the event query", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ errors: [{ message: "zone does not have access to firewall events" }] }));

    const snapshot = await getCloudflareSecurityLog({ cf: { env: {
      CLOUDFLARE_API_TOKEN: "test-denied-token",
      CLOUDFLARE_ZONE_ID: "security-denied-zone",
    } } }, "threats", "1h");

    expect(snapshot).toEqual({ kind: "threats", status: "permission-required", range: "1h", sampled: true });
    expect(JSON.stringify(snapshot)).not.toContain("access to firewall");
  });
});
