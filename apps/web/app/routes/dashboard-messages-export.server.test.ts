import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => {
  const limit = vi.fn(async () => [] as Record<string, unknown>[]);
  const where = vi.fn((_condition: unknown) => ({ orderBy: () => ({ limit }) }));
  const db = { select: vi.fn(() => ({ from: () => ({ where }) })) };
  return { db, limit, where, access: vi.fn(async () => ({ db })) };
});
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("../lib/contact-inbox-access.server", () => ({ requireContactInboxAccess: mocks.access }));
import { loader } from "./dashboard-messages-export";

const args = (filter = "all") => ({ request: new Request(`http://localhost:3002/dashboard/messages/export?filter=${filter}`), params: {}, context: {} }) as Parameters<typeof loader>[0];
beforeEach(() => { vi.clearAllMocks(); mocks.limit.mockResolvedValue([]); });

describe("enquiry CSV download", () => {
  it("requires inbox access before reading messages", async () => {
    const denied = new Response(null, { status: 403 });
    mocks.access.mockRejectedValueOnce(denied);
    await expect(loader(args())).rejects.toBe(denied);
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("returns a private CSV attachment even when the view is empty", async () => {
    const result = await loader(args("replied"));
    expect(result.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(result.headers.get("Content-Disposition")).toContain('filename="edicut-customer-support-replied.csv"');
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(await result.text()).toBe("id,name,email,projectType,monthlyVolume,message,status,lastReply,repliedAt,createdAt,updatedAt");
    expect(mocks.where).toHaveBeenCalledWith(expect.anything());
    expectNoPartnerApplications(mocks.where.mock.calls[0][0]);
    expect(mocks.limit).toHaveBeenCalledWith(1001);
  });

  it.each(["all", "replied", "unreplied"])("excludes partner applications from the %s CSV export", async (filter) => {
    await loader(args(filter));
    expectNoPartnerApplications(mocks.where.mock.calls[0][0]);
  });

  it("bounds exports and rejects oversized results", async () => {
    mocks.limit.mockResolvedValue(Array.from({ length: 1001 }, () => ({})));
    const result = await loader(args());
    expect(result.status).toBe(413);
    expect(result.headers.get("Cache-Control")).toBe("no-store");
    expect(result.headers.get("Content-Disposition")).toBeNull();
  });

  it("escapes quotes and keeps formula-like enquiry text inert", async () => {
    mocks.limit.mockResolvedValue([{ id: "m1", name: 'Alex "Morgan"', message: '=HYPERLINK("https://example.com")', createdAt: new Date("2026-10-04T00:00:00Z") }]);
    const result = await loader(args("invalid"));
    const csv = await result.text();
    expect(csv).toContain('"Alex ""Morgan"""');
    expect(csv).toContain(`"'=HYPERLINK(""https://example.com"")"`);
    expect(csv).toContain('"2026-10-04T00:00:00.000Z"');
    expectNoPartnerApplications(mocks.where.mock.calls[0][0]);
  });
});

function expectNoPartnerApplications(condition: unknown) {
  const query = new PgDialect().sqlToQuery(condition as SQL);
  const normalizedSql = query.sql.toLowerCase();
  expect(normalizedSql).toContain('"contact_messages"."project_type" is null');
  expect(normalizedSql).toContain('"contact_messages"."project_type" <>');
  expect(query.params).toContain("Video editor partner application");
}
