import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  requireAdmin: vi.fn(async () => ({ id: "admin", name: "Admin", email: "admin@example.com", role: "admin" })),
  cloudflare: vi.fn(async () => ({ status: "unavailable" })),
  interactions: vi.fn(async () => ({ status: "available", items: [] })),
  sessions: vi.fn(async () => ({ status: "available", daily: [] })),
}));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("../lib/session.server", () => ({
  requireAdminUser: mocks.requireAdmin,
  getAdminSession: async () => ({}), commitAdminSession: async () => "admin-session",
}));
vi.mock("../lib/provider-usage.server", () => ({ getCloudflareAnalyticsDashboard: mocks.cloudflare }));
vi.mock("../lib/site-analytics.server", () => ({
  getSiteInteractionSnapshot: mocks.interactions, getSiteEngagedSessionsSnapshot: mocks.sessions,
}));

import { headers, loader } from "./admin-analytics";
const load = (period: string) => loader({ request: new Request(`http://localhost:3002/site/node-logmin/analytics?period=${encodeURIComponent(period)}`), context: {}, params: {} } as never);

beforeEach(() => { vi.clearAllMocks(); });
describe("admin report period loader", () => {
  it.each(["daily", "weekly", "monthly"])("passes the %s range consistently to every on-site report", async (period) => {
    const result = await load(period);
    expect(result.data.report.period).toBe(period);
    expect(mocks.interactions).toHaveBeenCalledWith(mocks.db, result.data.report);
    expect(mocks.sessions).toHaveBeenCalledWith(mocks.db, result.data.report);
    expect(result.data.interactions).toEqual({ status: "available", items: [] });
    expect(result.data.engagedSessions).toEqual({ status: "available", daily: [] });
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.interactions.mock.invocationCallOrder[0]);
    expect(headers()["Cache-Control"]).toBe("no-store");
  });

  it("ignores arbitrary URL periods and keeps query bounds finite", async () => {
    const result = await load("365000;DROP TABLE events");
    expect(result.data.report).toMatchObject({ period: "monthly", days: 30 });
  });

  it("requires administrator access before reading any analytics", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Response("Forbidden", { status: 403 }));
    await expect(load("daily")).rejects.toMatchObject({ status: 403 });
    expect(mocks.interactions).not.toHaveBeenCalled();
    expect(mocks.sessions).not.toHaveBeenCalled();
    expect(mocks.cloudflare).not.toHaveBeenCalled();
  });

  it("commits period and totals together and contains individual report failures", async () => {
    const deferred = Promise.withResolvers<{ status: string; items: never[] }>();
    mocks.interactions.mockReturnValueOnce(deferred.promise);
    mocks.sessions.mockRejectedValueOnce(new Error("private query detail"));
    let completed = false;
    const result = load("weekly").then((value) => { completed = true; return value; });
    await vi.waitFor(() => expect(mocks.interactions).toHaveBeenCalled());
    expect(completed).toBe(false);
    deferred.resolve({ status: "available", items: [] });
    const loaded = await result;
    expect(loaded.data.report.period).toBe("weekly");
    expect(loaded.data.engagedSessions).toEqual({ status: "not-configured", daily: [] });
  });
});
