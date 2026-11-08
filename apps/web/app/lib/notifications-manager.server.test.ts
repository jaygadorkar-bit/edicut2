import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DatabaseClient } from "@edicut/db/client";
import { getWorkspaceNotificationFeed } from "./notifications.server";
describe("manager notification confidentiality", () => {
  it("scopes every project and review source to the manager's assigned clients", async () => {
    const execute = vi.fn().mockResolvedValue([]),
      db = { execute } as unknown as DatabaseClient,
      id = "11111111-1111-4111-8111-111111111111";
    await getWorkspaceNotificationFeed(db, {
      id,
      role: "project_manager",
      admin: false,
      features: ["projects", "reviews"],
    });
    expect(execute.mock.calls.length).toBeGreaterThan(4);
    for (const [sql] of execute.mock.calls) {
      const query = new PgDialect().sqlToQuery(sql);
      expect(query.sql).toContain("assignment.client_id=p.owner_id");
      expect(query.sql).toContain(
        "manager.active AND manager.deleted_at IS NULL AND manager.role='project_manager'",
      );
      expect(query.params).toContain(id);
      expect(query.sql).toContain(
        "client.active AND client.deleted_at IS NULL AND client.role IN ('user','customer')",
      );
    }
    const projectRequestQuery = execute.mock.calls
      .map(([statement]) => new PgDialect().sqlToQuery(statement).sql)
      .find((query) => query.includes("New editing request"));
    expect(projectRequestQuery).toBeDefined();
    expect(projectRequestQuery).toContain("'action' ELSE 'normal' END AS priority");
    expect(projectRequestQuery).toContain("membership.project_id=p.id");
    expect(projectRequestQuery).toContain("editor.role='editor'");
  });
  it("keeps project request events available without review assignment tables", async () => {
    const execute = vi.fn().mockResolvedValue([]),
      db = { execute } as unknown as DatabaseClient,
      id = "11111111-1111-4111-8111-111111111111";
    await getWorkspaceNotificationFeed(db, {
      id,
      role: "customer",
      admin: false,
      features: ["projects"],
    });
    const projectRequestQuery = execute.mock.calls
      .map(([statement]) => new PgDialect().sqlToQuery(statement).sql)
      .find((query) => query.includes("New editing request"));
    expect(projectRequestQuery).toBeDefined();
    expect(projectRequestQuery).toContain("'normal' AS priority");
    expect(projectRequestQuery).not.toContain("project_review_members membership");
  });
});
