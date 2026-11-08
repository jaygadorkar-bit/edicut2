import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DatabaseClient } from "@edicut/db/client";
import { chatAccessRecipients } from "./chat-realtime.server";
const clientId = "11111111-1111-4111-8111-111111111111",
  managerId = "22222222-2222-4222-8222-222222222222";
describe("client assignment refresh recipients", () => {
  it("uses the canonical manager even for D1 clients with no conversation mirror", async () => {
    const execute = vi.fn().mockResolvedValue([{ key: `user:${managerId}` }]),
      db = { execute } as unknown as DatabaseClient;
    const result = await chatAccessRecipients(db, [clientId], undefined, {
      cf: { env: { CHAT_BACKEND: "d1" } },
    } as unknown as Parameters<typeof chatAccessRecipients>[3]);
    expect(result).toEqual([`user:${managerId}`, `user:${clientId}`]);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("client_project_managers");
    expect(query.sql).not.toContain("chat_rooms");
    expect(query.params).toContain(clientId);
  });
  it("follows an order's owner to the assigned manager after payment changes", async () => {
    const execute = vi.fn().mockResolvedValue([]),
      db = { execute } as unknown as DatabaseClient;
    await chatAccessRecipients(db, [], clientId);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("SELECT owner_id FROM customer_subscriptions");
    expect(query.sql).toContain("client_id IN (SELECT id FROM affected)");
    expect(query.params).toContain(clientId);
  });
});
