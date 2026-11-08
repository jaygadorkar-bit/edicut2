import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import { loadAssignedProjectSummary } from "./project-review.server";

describe("assigned project overview summaries", () => {
  it("aggregates the manager's team queue while retaining the active editor check", async () => {
    const execute = vi.fn(async (_query: SQL) => [{ total: "12", active: "7", reviews: "3", delivered: "5", unassigned: "2" }]);
    const db = { execute } as unknown as DatabaseClient;
    const result = await loadAssignedProjectSummary(db, {
      id: "11111111-1111-4111-8111-111111111111",
      key: "user:11111111-1111-4111-8111-111111111111",
      name: "Manager",
      role: "project_manager",
      admin: false,
    });

    expect(result).toEqual({ total: 12, active: 7, reviews: 3, delivered: 5, unassigned: 2 });
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("FROM workspace_projects p");
    expect(query.sql).toContain("client_project_managers");
    expect(query.sql).toContain("project_review_members");
    expect(query.sql).toContain("u.role = 'editor'");
    expect(query.sql).toContain("viewer.role=$3");
    expect(query.params).toContain("11111111-1111-4111-8111-111111111111");
    expect(query.params).toContain("project_manager");
  });

  it("returns zero totals if the project-review assignment schema is not installed", async () => {
    const execute = vi.fn(async () => {
      throw { code: "42P01", message: "relation project_review_members does not exist" };
    });
    const db = { execute } as unknown as DatabaseClient;
    const result = await loadAssignedProjectSummary(db, {
      id: "22222222-2222-4222-8222-222222222222",
      key: "user:22222222-2222-4222-8222-222222222222",
      name: "Editor",
      role: "editor",
      admin: false,
    });

    expect(result).toEqual({ total: 0, active: 0, reviews: 0, delivered: 0, unassigned: 0 });
  });
});
