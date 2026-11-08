import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DatabaseClient } from "@edicut/db/client";
import {
  assignClientProjectManager,
  importMissingClientProjectManagers,
} from "./client-project-managers.server";
const clientId = "11111111-1111-4111-8111-111111111111",
  managerId = "22222222-2222-4222-8222-222222222222",
  otherId = "33333333-3333-4333-8333-333333333333";
const admin = {
  id: otherId,
  key: `admin:${otherId}`,
  name: "Admin",
  role: "admin",
  admin: true,
};
describe("authoritative client manager assignments", () => {
  it("imports legacy assignments with the recordset's field names and preserves existing choices", async () => {
    const execute = vi.fn().mockResolvedValue([]),
      db = { execute } as unknown as DatabaseClient;
    await importMissingClientProjectManagers(db, admin, [
      { clientId, managerId },
    ]);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(JSON.parse(query.params[0] as string)).toEqual([
      { client_id: clientId, manager_id: managerId },
    ]);
    expect(query.sql).toContain("ON CONFLICT (client_id) DO NOTHING");
  });
  it("limits a manager's import to their own existing chat assignments", async () => {
    const execute = vi.fn().mockResolvedValue([]),
      db = { execute } as unknown as DatabaseClient;
    await importMissingClientProjectManagers(
      db,
      { ...admin, id: managerId, role: "project_manager", admin: false },
      [
        { clientId, managerId },
        { clientId: otherId, managerId: otherId },
      ],
    );
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(JSON.parse(query.params[0] as string)).toEqual([
      { client_id: clientId, manager_id: managerId },
    ]);
  });
  it("requires an administrator for manual assignment and never executes a client request", async () => {
    const execute = vi.fn(),
      db = { execute } as unknown as DatabaseClient;
    await expect(
      assignClientProjectManager(
        db,
        { ...admin, role: "customer", admin: false },
        clientId,
        managerId,
        null,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(execute).not.toHaveBeenCalled();
  });
  it("allows pre-payment assignment while retaining current-role, active-manager and stale-form guards", async () => {
    const execute = vi.fn().mockResolvedValue([{ clientId }]),
      db = { execute } as unknown as DatabaseClient;
    await assignClientProjectManager(db, admin, clientId, managerId, null);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).not.toContain("customer_subscriptions");
    expect(query.sql).toContain("client.role IN ('user', 'customer')");
    expect(query.sql).toContain("manager.active");
    expect(query.sql).toContain("admin.active AND admin.role='admin'");
    expect(query.sql).toContain("current_assignment.client_id=client.id");
    expect(query.sql).toContain(
      "client_project_managers.manager_id IS NOT DISTINCT FROM",
    );
  });
  it("returns a conflict when an assignment has changed or an account is unavailable", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue([]),
    } as unknown as DatabaseClient;
    await expect(
      assignClientProjectManager(db, admin, clientId, managerId, otherId),
    ).rejects.toMatchObject({ status: 409 });
  });
});
