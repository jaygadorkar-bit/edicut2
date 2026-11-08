import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DatabaseClient } from "@edicut/db/client";
import { loadManagerActionQueue, loadManagerClientDirectory } from "./manager-workspace.server";
import { loadAssignedProjects } from "./project-review.server";

const managerId = "11111111-1111-4111-8111-111111111111";
const manager = { id: managerId, key: `user:${managerId}`, name: "Manager", role: "project_manager", admin: false };

describe("manager workspace data", () => {
  it("returns assigned clients with counts and only their three newest projects", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([{
        id: "client-1", name: "Creator", email: "creator@example.com", projectCount: 4,
        activeProjectCount: 2, reviewCount: 1, lastActivity: "2026-10-15T12:00:00Z", assignedAt: "2026-09-01T12:00:00Z",
      }])
      .mockResolvedValueOnce([
        { id: "project-3", clientId: "client-1", title: "Newest", status: "editing", deadline: null, updatedAt: "2026-10-15T12:00:00Z" },
      ]);
    const db = { execute } as unknown as DatabaseClient;

    const result = await loadManagerClientDirectory(db, manager);

    expect(result[0]).toMatchObject({
      id: "client-1", projectCount: 4, activeProjectCount: 2, reviewCount: 1,
      recentProjects: [{ id: "project-3", title: "Newest" }],
    });
    const queries = execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query));
    expect(queries[0].sql).toContain("assignment.manager_id=");
    expect(queries[0].sql).toContain("client.role IN ('user','customer')");
    expect(queries[1].sql).toContain("row_number() OVER (PARTITION BY p.owner_id");
    expect(queries.every(query => query.params.includes(managerId))).toBe(true);
  });

  it("prioritizes work only within the manager's assigned client projects", async () => {
    const execute = vi.fn().mockResolvedValue([{
      id: "project-1", ownerId: "client-1", title: "Edit", channelName: "Channel", status: "editing",
      deadline: "2026-10-20", notes: null, updatedAt: "2026-10-16T12:00:00Z", clientName: "Creator",
      nextAction: "Assign an editor",
    }]);
    const result = await loadManagerActionQueue({ execute } as unknown as DatabaseClient, manager);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);

    expect(result[0]).toMatchObject({ clientName: "Creator", nextAction: "Assign an editor" });
    expect(query.sql).toContain("assignment.manager_id=");
    expect(query.sql).toContain("project_review_members");
    expect(query.sql).toContain("Past target date");
    expect(query.params).toContain(managerId);
  });

  it("omits review counts when Reviews access is disabled", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([{
        id: "client-1", name: "Creator", email: "creator@example.com", projectCount: 4,
        activeProjectCount: 2, reviewCount: 0, lastActivity: null, assignedAt: "2026-09-01T12:00:00Z",
      }])
      .mockResolvedValueOnce([]);

    const result = await loadManagerClientDirectory({ execute } as unknown as DatabaseClient, manager, false);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(result[0].reviewCount).toBe(0);
    expect(query.params).toContain(false);
  });

  it("does not select project briefs for the staff list without Reviews access", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([{
        id: "project-1", ownerId: "client-1", title: "Edit", channelName: "Channel",
        status: "editing", deadline: null, notes: null, updatedAt: "2026-10-16T12:00:00Z",
      }]);

    const result = await loadAssignedProjects({ execute } as unknown as DatabaseClient, manager, "", "all", 1, false);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[1][0]);

    expect(result.projects[0].notes).toBeNull();
    expect(query.sql).toContain("NULL::text AS notes");
    expect(query.sql).not.toContain("p.notes");
  });

  it("rejects non-manager client directory and queue reads before querying", async () => {
    const execute = vi.fn();
    const db = { execute } as unknown as DatabaseClient;
    const editor = { ...manager, role: "editor" };

    await expect(loadManagerClientDirectory(db, editor)).rejects.toMatchObject({ status: 403 });
    await expect(loadManagerActionQueue(db, editor)).rejects.toMatchObject({ status: 403 });
    expect(execute).not.toHaveBeenCalled();
  });
});
