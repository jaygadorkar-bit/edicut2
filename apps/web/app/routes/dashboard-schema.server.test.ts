import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => {
  const project = { id: "project-1", ownerId: "owner-1", title: "Existing edit", channelName: "Channel", status: "review", updatedAt: new Date() };
  const where = vi.fn();
  const select = vi.fn((fields?: Record<string, unknown>) => {
    if (!fields || "couponId" in fields || "affiliateId" in fields) throw new Error("Unexpected marketing column in workspace read");
    const rows = "total" in fields ? [{ total: 2, active: 1, reviews: 1 }] : "count" in fields ? [{ count: 3 }] : [project];
    const result = Promise.resolve(rows);
    const ordered = Object.assign(result, { limit: vi.fn(() => result) });
    return { from: vi.fn(() => ({ where: (...args: unknown[]) => {
      where(...args);
      return Object.assign(result, { orderBy: vi.fn(() => ordered) });
    } })) };
  });
  const db = { select, execute: vi.fn(async (_query: SQL) => []) };
  return {
    project, where, db,
  allowedFeatures: ["overview", "projects", "reviews", "uploads", "billing", "settings"] as string[],
  getSiteSetting: vi.fn(async () => null),
    requireUserId: vi.fn(async () => "owner-1"),
    findUserById: vi.fn(async () => ({ id: "owner-1", name: "Client", email: "client@example.com", role: "user" })),
    consumeUsageLimit: vi.fn(async () => "allowed"),
    queueTelegramOrderNotice: vi.fn(),
  };
});
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db, hasReturnedRows: (rows: unknown[]) => rows.length > 0 }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.findUserById }));
vi.mock("../lib/session.server", () => ({ requireUserId: mocks.requireUserId, getSession: vi.fn(), destroySession: vi.fn() }));
vi.mock("../lib/site-settings.server", () => ({ getRoleFeatureAccessSettings: async () => ({}), getSiteSetting: mocks.getSiteSetting }));
vi.mock("../lib/role-feature-access", () => ({
  canAccessDashboardFeature: (_role: string, feature: string) => mocks.allowedFeatures.includes(feature),
  getAllowedDashboardFeatures: () => mocks.allowedFeatures,
  getDashboardLandingPath: (features: string[]) => features.length ? `/dashboard/${features[0]}` : "/dashboard",
}));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.consumeUsageLimit, requestBodyExceedsLimit: () => false }));
vi.mock("../lib/telegram-notifications.server", () => ({ queueTelegramOrderNotice: mocks.queueTelegramOrderNotice }));
import { loader as dashboardLoader } from "./dashboard";
import { loader as sectionLoader, action as sectionAction } from "./dashboard-placeholder";
import { workspaceProjectColumns } from "../lib/workspace-projects.server";

function args(section?: string, body?: URLSearchParams) {
  const url = new URL(`http://localhost:3002/dashboard${section ? `/${section}` : ""}`);
  return { request: new Request(url, body ? { method: "POST", body } : {}), url, pattern: "/dashboard/:section", params: { section }, context: {} } as Parameters<typeof sectionLoader>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowedFeatures = ["overview", "projects", "reviews", "uploads", "billing", "settings"];
});

describe("workspace reads without the optional marketing migration", () => {
  it("loads existing dashboard projects and real summary counts", async () => {
    const result = await dashboardLoader(args());
    expect(result.workspaceReady).toBe(true);
    expect(result.projects).toEqual([mocks.project]);
    expect(result).toMatchObject({ projectCount: 2, activeCount: 1, reviewCount: 1, fileCount: 3 });
    expect(mocks.db.select).toHaveBeenCalledWith(workspaceProjectColumns);
    for (const [filter] of mocks.where.mock.calls) {
      expect(new PgDialect().sqlToQuery(filter).params).toContain("owner-1");
    }
  });

  it("does not load workspace data or loop redirects when a role has no dashboard pages", async () => {
    mocks.allowedFeatures = [];

    const result = await dashboardLoader(args());

    expect(result.noDashboardAccess).toBe(true);
    expect(result.projects).toEqual([]);
    expect(result.projectCount).toBe(0);
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("does not return project or upload details when those dashboard pages are disabled", async () => {
    mocks.allowedFeatures = ["overview", "reviews"];

    const result = await dashboardLoader(args());

    expect(result.projects).toEqual([]);
    expect(result.projectCount).toBe(0);
    expect(result.activeCount).toBe(0);
    expect(result.fileCount).toBe(0);
    expect(result.reviewCount).toBe(1);
    expect(mocks.db.select).not.toHaveBeenCalledWith(workspaceProjectColumns);
  });

  it.each(["projects"])("loads %s without selecting marketing fields", async section => {
    const result = await sectionLoader(args(section));
    expect(result.workspaceReady).toBe(true);
    expect(result.projects).toEqual([mocks.project]);
    expect(result.projectOptions).toEqual([{ id: "project-1", title: "Existing edit" }]);
    expect(mocks.db.select).toHaveBeenCalledWith(workspaceProjectColumns);
  });

  it("redirects the former billing page to Subscription", async () => {
    try {
      await sectionLoader(args("billing"));
      throw new Error("Expected a redirect");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).headers.get("Location")).toBe("/dashboard/subscriptions");
    }
  });

  it("creates a core project using parameterized SQL without marketing columns", async () => {
    const body = new URLSearchParams({ intent: "create-project", title: "New edit", channelName: "Channel", packageSlug: "creator", notes: "Use this client's style" });
    expect(await sectionAction(args("projects", body))).toMatchObject({ success: expect.any(String) });
    const query = new PgDialect().sqlToQuery(mocks.db.execute.mock.calls[0]![0]);
    expect(query.sql).not.toMatch(/coupon|affiliate|discount/);
    expect(query.sql).toContain("INSERT INTO workspace_projects");
    expect(query.sql).not.toContain("Use this client's style");
    expect(query.params).toContain("owner-1");
    expect(query.params).toContain("Use this client's style");
    expect(query.params).toContain(214900);
    expect(mocks.queueTelegramOrderNotice).toHaveBeenCalledOnce();
    const notice = mocks.queueTelegramOrderNotice.mock.calls[0]![1];
    expect(notice).toMatchObject({ kind: "project", summary: "New edit — Starter", amountCents: 214900, currency: "USD" });
    expect(query.params).toContain(notice.orderId);
  });
});
