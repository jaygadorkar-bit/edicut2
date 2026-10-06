import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const mocks = vi.hoisted(() => {
  const chain = { set: vi.fn(), where: vi.fn(), returning: vi.fn(), from: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), offset: vi.fn() };
  chain.set.mockReturnValue(chain); chain.where.mockReturnValue(chain); chain.from.mockReturnValue(chain); chain.orderBy.mockReturnValue(chain); chain.limit.mockReturnValue(chain);
  return { chain, db: { update: vi.fn(() => chain), select: vi.fn(() => chain) }, admin: vi.fn(), limit: vi.fn() };
});
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("../lib/session.server", () => ({ requireAdminUser: mocks.admin, isAdminRole: (role: string) => role === "admin" }));
vi.mock("../lib/usage-protection.server", async original => ({ ...await original<typeof import("../lib/usage-protection.server")>(), consumeUsageLimit: mocks.limit }));
import { action, loader } from "./admin-quotes";
const id = "22222222-2222-4222-8222-222222222222";
const time = "2026-10-04T10:00:00.123Z";
const valid = { intent: "update-quote", quoteId: id, expectedUpdatedAt: time, status: "reviewing", internalNotes: "Follow up tomorrow." };
function args(fields?: Record<string, string>, query = "", headers?: Record<string, string>) {
  return { request: new Request(`http://localhost:3002/site/node-logmin/quotes${query}`, fields ? { method: "POST", headers, body: new URLSearchParams(fields) } : {}), params: {}, context: {} } as Parameters<typeof loader>[0];
}
beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ id: "admin", role: "admin", active: true, email: "admin@example.com", passwordHash: "private" }); mocks.limit.mockResolvedValue("allowed"); mocks.chain.returning.mockResolvedValue([{ id }]); });
describe("admin quote access and updates", () => {
  it.each([{ role: "user", active: true }, { role: "admin", active: false }])("denies unauthorized admin viewing and editing", async account => {
    mocks.admin.mockResolvedValue(account);
    await expect(loader(args())).rejects.toMatchObject({ status: 403 });
    await expect(action(args(valid))).rejects.toMatchObject({ status: 403 });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });
  it("rejects cross-site edits, invalid statuses, and overlong notes", async () => {
    expect(await action(args(valid, "", { Origin: "https://evil.example" }))).toMatchObject({ init: { status: 403 } });
    expect(await action(args({ ...valid, status: "paid" }))).toMatchObject({ init: { status: 400 } });
    expect(await action(args({ ...valid, internalNotes: "a".repeat(4001) }))).toMatchObject({ init: { status: 400 } });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });
  it("updates only the displayed revision and ignores forged account/options fields", async () => {
    expect(await action(args({ ...valid, ownerId: "fake", options: "{}" }))).toMatchObject({ success: "Quote request updated." });
    expect(mocks.chain.set).toHaveBeenCalledWith({ status: "reviewing", internalNotes: valid.internalNotes, updatedAt: expect.any(Date) });
    const compiled = new PgDialect().sqlToQuery(mocks.chain.where.mock.calls[0][0]);
    expect(compiled.params).toEqual([id, time]); expect(compiled.sql).toContain("date_trunc('milliseconds'");
  });
  it("reports a stale request without overwriting another admin’s edit", async () => {
    mocks.chain.returning.mockResolvedValueOnce([]);
    expect(await action(args(valid))).toMatchObject({ init: { status: 409 } });
  });
  it("rejects invalid revision timestamps and excessive update rates", async () => {
    expect(await action(args({ ...valid, expectedUpdatedAt: "yesterday" }))).toMatchObject({ init: { status: 400 } });
    mocks.limit.mockResolvedValueOnce("denied");
    expect(await action(args(valid))).toMatchObject({ init: { status: 429 } });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });
  it("clamps page requests and removes secrets from admin loader data", async () => {
    // The two aggregate queries are awaitable while the records query uses offset.
    let selected = 0;
    mocks.db.select.mockImplementation(() => {
      selected++;
      if (selected === 1) return { from: () => ({ where: async () => [{ count: 16 }] }) } as never;
      if (selected === 2) return { from: async () => [{ total: 16, new: 16, reviewing: 0, contacted: 0, closed: 0 }] } as never;
      return mocks.chain;
    });
    mocks.chain.offset.mockResolvedValueOnce([{ id }]);
    const result = await loader(args(undefined, "?page=99999999&status=invalid"));
    expect(result).toMatchObject({ status: "all", page: 2, totalPages: 2, records: [{ id }] });
    expect(result.admin).not.toHaveProperty("passwordHash"); expect(mocks.chain.offset).toHaveBeenCalledWith(15);
  });
});
