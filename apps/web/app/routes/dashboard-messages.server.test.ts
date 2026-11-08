import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => {
  const offset = vi.fn(async () => [{ id: "message-last-page" }]);
  const count = vi.fn(async () => [{ count: 21 }]);
  const whereCalls: unknown[] = [];
  const select = vi.fn((columns?: unknown) => ({ from: () => ({ where: (condition: unknown) => {
    whereCalls.push(condition);
    return columns ? count() : { orderBy: () => ({ limit: () => ({ offset }) }) };
  } }) }));
  return { db: { select }, offset, count, whereCalls };
});
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("../lib/contact-inbox-access.server", () => ({ requireContactInboxAccess: async () => ({ db: mocks.db, user: { id: "admin-1", email: "admin@example.com", name: "Admin", role: "admin" }, allowedFeatures: ["support"] }) }));
import { loader } from "./dashboard-messages";
const args = (search: string) => ({ request: new Request(`http://localhost:3002/dashboard/messages?${search}`), params: {}, context: {} }) as Parameters<typeof loader>[0];
beforeEach(() => { vi.clearAllMocks(); mocks.count.mockResolvedValue([{ count: 21 }]); mocks.whereCalls.length = 0; });
describe("contact inbox pagination", () => {
  it("fetches the last real page when the requested page is too large", async () => {
    const result = await loader(args("page=999999999999"));
    expect(mocks.offset).toHaveBeenCalledWith(20);
    expect(result).toMatchObject({ page: 3, totalPages: 3, unreadCount: 21, messages: [{ id: "message-last-page" }] });
    expect(mocks.count).toHaveBeenCalledTimes(4);
  });
  it.each(["NaN", "Infinity", "-2", "1.5"])("uses the first page for invalid input %s", async (page) => {
    const result = await loader(args(`page=${page}`));
    expect(mocks.offset).toHaveBeenCalledWith(0);
    expect(result).toMatchObject({ page: 1 });
  });
  it("keeps empty inboxes on page one", async () => {
    mocks.count.mockResolvedValue([{ count: 0 }]);
    expect(await loader(args("page=9"))).toMatchObject({ page: 1, totalPages: 1, total: 0 });
    expect(mocks.offset).toHaveBeenCalledWith(0);
  });

  it("excludes partner applications from the inbox, metrics, and unread count", async () => {
    await loader(args(""));

    expect(mocks.whereCalls).toHaveLength(5);
    for (const condition of mocks.whereCalls) {
      const query = new PgDialect().sqlToQuery(condition as SQL);
      const normalizedSql = query.sql.toLowerCase();
      expect(normalizedSql).toContain('"contact_messages"."project_type" is null');
      expect(normalizedSql).toContain('"contact_messages"."project_type" <>');
      expect(query.params).toContain("Video editor partner application");
    }
  });

  it("removes the stale unknown-action alert while preserving other inbox filters", async () => {
    const response = await loader(args("filter=unreplied&page=2&error=Unknown+messages+action."));

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get("Location")).toBe("/dashboard/messages?filter=unreplied&page=2");
    expect((response as Response).headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
