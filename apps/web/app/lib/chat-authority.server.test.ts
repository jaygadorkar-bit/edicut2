import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DatabaseClient } from "@edicut/db/client";
import type { ChatActor } from "./chat";
import { loadChatAuthority } from "./chat-authority.server";

const actor: ChatActor = { id: "10000000-0000-4000-8000-000000000001", key: "user:10000000-0000-4000-8000-000000000001", name: "Client", role: "customer", admin: false };
const source = { users: [{ ...actor, email: "client@example.test", active: true, deletedAt: null, paid: true }], admins: [] };

describe("fresh chat authority reads", () => {
  it("restricts customer reads to the current customer and staff without interpolating their id", async () => {
    const execute = vi.fn().mockResolvedValue([{ authority: source }]);
    await expect(loadChatAuthority({ execute } as unknown as DatabaseClient, actor)).resolves.toEqual(source);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("FROM users u WHERE u.id = $1::uuid OR u.role IN ('project_manager', 'customer_support')");
    expect(query.params).toEqual([actor.id]);
    expect(query.sql).not.toContain(actor.id);
  });

  it.each([undefined, { ...actor, role: "project_manager" }, { ...actor, role: "customer_support" }, { ...actor, role: "admin", admin: true }])("retains the directory for staff and recipient fan-out: %j", async viewer => {
    const execute = vi.fn().mockResolvedValue([{ authority: source }]);
    await loadChatAuthority({ execute } as unknown as DatabaseClient, viewer);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("FROM users u WHERE true"); expect(query.params).toEqual([]);
  });

  it("reads changed permissions on the next operation without retaining the previous result", async () => {
    const revoked = { ...source, users: [{ ...source.users[0], active: false, paid: false }] };
    const execute = vi.fn().mockResolvedValueOnce([{ authority: source }]).mockResolvedValueOnce([{ authority: revoked }]);
    const db = { execute } as unknown as DatabaseClient;
    expect((await loadChatAuthority(db, actor)).users[0].active).toBe(true);
    expect((await loadChatAuthority(db, actor)).users[0]).toMatchObject({ active: false, paid: false });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
