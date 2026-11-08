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
  const assignedProject = { id: "assigned-project", ownerId: "owner-1", title: "Assigned edit", channelName: "Creator", status: "editing", deadline: null, notes: null, updatedAt: new Date() };
  return {
    project, assignedProject, where, db,
  allowedFeatures: ["overview", "projects", "reviews", "uploads", "billing", "settings"] as string[],
    loadAssignedProjects: vi.fn(async (_db: unknown, _actor: unknown, _query: string, view: string) => ({ projects: view === "all" ? [assignedProject] : [], count: view === "unassigned" ? 1 : 6, page: 1, pageCount: 1 })),
    loadAssignedProjectSummary: vi.fn(async () => ({ total: 6, active: 4, reviews: 2, delivered: 2, unassigned: 1 })),
    loadReviewEditorOptions: vi.fn(async () => [{ id: "editor-1", name: "Alex Editor", role: "editor", activeProjects: 2 }]),
    loadManagerActionQueue: vi.fn(async () => []),
    getAffiliatePortalData: vi.fn(async () => ({ id: "affiliate-1", code: "ALEXEDIT", commissionRateBps: 1000, active: true, referralUrl: "https://example.test/ref", orderCount: 3, paidOrderCount: 2, paidRevenueCents: 50000, commissionEarnedCents: 5000, pendingCommissionCents: 1000, orders: [] })),
    isMissingMarketingSchema: vi.fn(() => false),
  getSiteSetting: vi.fn(async () => null),
    requireUserId: vi.fn(async () => "owner-1"),
    findUserById: vi.fn(async () => ({ id: "owner-1", name: "Client", email: "client@example.com", role: "user", active: true, deletedAt: null, passwordHash: "server-only" })),
    consumeUsageLimit: vi.fn(async () => "allowed"),
    queueTelegramOrderNotice: vi.fn(),
    loadClientWorkspace: vi.fn(async () => ({ profile: null, purchases: [] })),
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
vi.mock("../lib/client-workspace.server", () => ({ loadClientWorkspace: mocks.loadClientWorkspace, isMissingClientWorkspaceSchema: () => false }));
vi.mock("../lib/project-review.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/project-review.server")>()),
  loadAssignedProjects: mocks.loadAssignedProjects,
  loadAssignedProjectSummary: mocks.loadAssignedProjectSummary,
  loadReviewEditorOptions: mocks.loadReviewEditorOptions,
  isMissingReviewSchema: () => false,
}));
vi.mock("../lib/manager-workspace.server", () => ({ loadManagerActionQueue: mocks.loadManagerActionQueue }));
vi.mock("../lib/chat-store.server", () => ({ createChatStore: () => ({ listLegacyClientManagerAssignments: async () => [] }) }));
vi.mock("../lib/marketing.server", () => ({
  getAffiliatePortalData: mocks.getAffiliatePortalData,
  isMissingMarketingSchema: mocks.isMissingMarketingSchema,
}));
import { loader as dashboardLoader } from "./dashboard";
import { loader as sectionLoader, action as sectionAction } from "./dashboard-placeholder";
import { workspaceProjectColumns, workspaceProjectSummaryColumns } from "../lib/workspace-projects.server";

function args(section?: string, body?: URLSearchParams) {
  const url = new URL(`http://localhost:3002/dashboard${section ? `/${section}` : ""}`);
  return { request: new Request(url, body ? { method: "POST", body } : {}), url, pattern: "/dashboard/:section", params: { section }, context: {} } as Parameters<typeof sectionLoader>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowedFeatures = ["overview", "projects", "reviews", "uploads", "billing", "settings"];
  mocks.findUserById.mockImplementation(async () => ({ id: "owner-1", name: "Client", email: "client@example.com", role: "user", active: true, deletedAt: null, passwordHash: "server-only" }));
});

describe("workspace reads without the optional marketing migration", () => {
  it("keeps credential hashes out of both dashboard and section loader data", async () => {
    expect((await dashboardLoader(args())).user).not.toHaveProperty("passwordHash");
    expect((await sectionLoader(args("projects"))).user).not.toHaveProperty("passwordHash");
  });
  it.each(["dashboard", "projects"])("blocks inactive accounts in %s before workspace reads", async section => {
    mocks.findUserById.mockResolvedValueOnce({ id: "owner-1", name: "Client", email: "client@example.com", role: "user", active: false, deletedAt: null, passwordHash: "server-only" });
    await expect(section === "dashboard" ? dashboardLoader(args()) : sectionLoader(args(section))).rejects.toMatchObject({ status: 302 });
    expect(mocks.db.select).not.toHaveBeenCalled();
  });
  it("blocks inactive accounts from creating projects", async () => {
    mocks.findUserById.mockResolvedValueOnce({ id: "owner-1", name: "Client", email: "client@example.com", role: "user", active: false, deletedAt: null, passwordHash: "server-only" });
    await expect(sectionAction(args("projects", new URLSearchParams({ intent: "create-project" })))).rejects.toMatchObject({ status: 302 });
    expect(mocks.db.execute).not.toHaveBeenCalled();
  });
  it("loads existing dashboard projects and real summary counts", async () => {
    const result = await dashboardLoader(args());
    expect(result.workspaceReady).toBe(true);
    expect(result.projects).toEqual([mocks.project]);
    expect(result).toMatchObject({ projectCount: 2, activeCount: 1, reviewCount: 1, fileCount: 3 });
    expect(mocks.db.select).toHaveBeenCalledWith(workspaceProjectSummaryColumns);
    for (const [filter] of mocks.where.mock.calls) {
      expect(new PgDialect().sqlToQuery(filter).params).toContain("owner-1");
    }
  });

  it("loads manager dashboard data through project assignments and team summaries", async () => {
    mocks.findUserById.mockImplementationOnce(async () => ({ id: "owner-1", name: "Manager", email: "manager@example.com", role: "project_manager", active: true, deletedAt: null, passwordHash: "server-only" }));

    const result = await dashboardLoader(args());

    expect(result).toMatchObject({
      projectCount: 6,
      activeCount: 4,
      reviewCount: 2,
      unassignedProjectCount: 1,
      assignedProjects: [mocks.assignedProject],
      editors: [{ id: "editor-1", activeProjects: 2 }],
    });
    expect(mocks.loadAssignedProjects).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ role: "project_manager" }), "", "all", 1);
    expect(mocks.loadReviewEditorOptions).toHaveBeenCalledOnce();
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.loadClientWorkspace).not.toHaveBeenCalled();
  });

  it("skips review queues and editor data when a manager lacks Reviews access", async () => {
    mocks.allowedFeatures = ["overview", "projects"];
    mocks.findUserById.mockImplementationOnce(async () => ({ id: "owner-1", name: "Manager", email: "manager@example.com", role: "project_manager", active: true, deletedAt: null, passwordHash: "server-only" }));

    const result = await dashboardLoader(args());

    expect(result).toMatchObject({ reviewCount: 0, editors: [], managerTasks: [] });
    expect(result.assignedProjects).toEqual([]);
    expect(mocks.loadAssignedProjects).not.toHaveBeenCalled();
    expect(mocks.loadReviewEditorOptions).not.toHaveBeenCalled();
    expect(mocks.loadManagerActionQueue).not.toHaveBeenCalled();
  });

  it("loads editor totals and project links from only assigned work", async () => {
    mocks.findUserById.mockImplementationOnce(async () => ({ id: "owner-1", name: "Editor", email: "editor@example.com", role: "editor", active: true, deletedAt: null, passwordHash: "server-only" }));

    const result = await dashboardLoader(args());

    expect(result).toMatchObject({
      projectCount: 6,
      activeCount: 4,
      reviewCount: 2,
      deliveredCount: 2,
      assignedProjects: [mocks.assignedProject],
    });
    expect(mocks.loadAssignedProjects).toHaveBeenCalledWith(mocks.db, expect.objectContaining({ role: "editor" }), "", "all", 1);
    expect(mocks.loadReviewEditorOptions).not.toHaveBeenCalled();
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.loadClientWorkspace).not.toHaveBeenCalled();
  });

  it("loads affiliate-only order totals without the customer billing snapshot", async () => {
    mocks.findUserById.mockImplementationOnce(async () => ({ id: "owner-1", name: "Affiliate", email: "affiliate@example.com", role: "affiliate", active: true, deletedAt: null, passwordHash: "server-only" }));

    const result = await dashboardLoader(args());

    expect(result.affiliateData).toMatchObject({ code: "ALEXEDIT", orderCount: 3, paidOrderCount: 2 });
    expect(result.affiliateReady).toBe(true);
    expect(mocks.getAffiliatePortalData).toHaveBeenCalledWith(mocks.db, "owner-1", "http://localhost:3002");
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.loadClientWorkspace).not.toHaveBeenCalled();
  });

  it("starts balance reads without waiting for project reads to finish", async () => {
    let finish!: (rows: unknown[]) => void;
    const rows = new Promise<unknown[]>(resolve => { finish = resolve; });
    mocks.db.select.mockImplementationOnce(() => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: () => rows }) }) }) }) as never);
    const result = dashboardLoader(args());
    try { await vi.waitFor(() => expect(mocks.loadClientWorkspace).toHaveBeenCalledOnce()); }
    finally { finish([mocks.project]); }
    expect((await result).balanceReady).toBe(true);
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
    expect(result.reviewCount).toBe(0);
    expect(mocks.db.select).not.toHaveBeenCalledWith(workspaceProjectColumns);
  });

  it("limits the Files page to source links when Reviews is disabled", async () => {
    mocks.allowedFeatures = ["overview", "projects", "uploads"];
    mocks.findUserById.mockResolvedValueOnce({ id: "owner-1", name: "Manager", email: "manager@example.com", role: "project_manager", active: true, deletedAt: null, passwordHash: "server-only" });

    const result = await sectionLoader(args("uploads"));

    expect(result.files).toEqual([]);
    const fileQuery = mocks.db.execute.mock.calls
      .map(([query]) => new PgDialect().sqlToQuery(query))
      .find(({ sql }) => sql.includes("FROM workspace_project_files f"));
    expect(fileQuery?.sql).toContain("f.kind='source'");
    expect(fileQuery?.params).toContain(false);
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

  it("does not allow the legacy form to bypass the paid project workflow", async () => {
    const body = new URLSearchParams({ intent: "create-project", title: "New edit", channelName: "Channel", packageSlug: "creator" });
    await expect(sectionAction(args("projects", body))).rejects.toMatchObject({ status: 302 });
    expect(mocks.db.execute).not.toHaveBeenCalled();
  });

  it("requires an explicit review decision instead of defaulting to approval", async () => {
    const body = new URLSearchParams({ intent: "submit-review", projectId: "11111111-1111-4111-8111-111111111111", decision: "" });
    await expect(sectionAction(args("reviews", body))).resolves.toMatchObject({ error: "Choose a project and a review decision." });
    expect(mocks.db.execute).not.toHaveBeenCalled();
  });

  it("does not accept a review decision when its preview link is missing", async () => {
    const body = new URLSearchParams({ intent: "submit-review", projectId: "11111111-1111-4111-8111-111111111111", decision: "approved" });
    await expect(sectionAction(args("reviews", body))).resolves.toMatchObject({ error: expect.stringContaining("preview link is missing") });
    const statement = new PgDialect().sqlToQuery(mocks.db.execute.mock.calls[0][0]);
    expect(statement.sql).toContain("workspace_project_files");
    expect(statement.sql).toContain("f.kind = 'review'");
    expect(statement.sql).toContain("NULLIF(BTRIM(f.share_url), '') IS NOT NULL");
  });

  it("writes manager file links only through the assigned-project access predicate", async () => {
    mocks.findUserById.mockResolvedValueOnce({ id: "owner-1", name: "Manager", email: "manager@example.com", role: "project_manager", active: true, deletedAt: null, passwordHash: "server-only" });
    const body = new URLSearchParams({
      intent: "add-file-link",
      projectId: "11111111-1111-4111-8111-111111111111",
      fileName: "Source footage",
      shareUrl: "https://drive.google.com/file/d/source-id/view",
    });

    await expect(sectionAction(args("uploads", body))).resolves.toMatchObject({ error: "That project is not assigned to your team." });

    const statement = new PgDialect().sqlToQuery(mocks.db.execute.mock.calls[0][0]);
    expect(statement.sql).toContain("client_project_managers");
    expect(statement.sql).toContain("INSERT INTO workspace_project_files");
    expect(statement.params).toContain("owner-1");
    expect(statement.params).not.toContain("manager@example.com");
  });
});
