import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  clientFilters,
  loadClientDetail,
  loadClientDirectory,
} from "./admin-clients.server";
describe("client operations queries", () => {
  it("bounds pagination and rejects unknown filter and manager values", () => {
    expect(
      clientFilters(
        new URLSearchParams(
          "q=" +
            "x".repeat(200) +
            "&page=9999999999&payment=bad&attention=bad&manager=bad&sort=bad",
        ),
      ),
    ).toEqual({
      q: "x".repeat(120),
      page: 100000,
      payment: "all",
      attention: "all",
      manager: "all",
      sort: "attention",
    });
  });
  it("uses explicit client roles, excludes trash and parameterizes search rather than interpolating it", async () => {
    const execute = vi
        .fn()
        .mockResolvedValue([
          { clients: [], summary: {}, total: 0, page: 1, pageCount: 1 },
        ]),
      db = { execute } as unknown as DatabaseClient;
    const filters = clientFilters(
      new URLSearchParams({
        q: "%_' OR true --",
        payment: "pending",
        attention: "needs-editor",
      }),
    );
    await loadClientDirectory(db, filters);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain(
      "u.role IN ('user','customer') AND u.deleted_at IS NULL",
    );
    expect(query.sql).not.toContain(filters.q);
    expect(query.params).toContain("%\\%\\_' OR true --%");
    expect(query.sql).toContain('"pendingOrders">0');
    expect(query.sql).toContain('"paidOrders"=0 AND "paidProjects"=0');
    expect(query.sql).toContain('"pendingInvoices">0');
    expect(query.sql).toContain(
      "'needs-manager' AND (\"paidOrders\">0 OR \"paidProjects\">0) AND NOT \"managerActive\"",
    );
    expect(query.sql).toContain(
      "'needsManager',count(*) FILTER(WHERE (\"paidOrders\">0 OR \"paidProjects\">0) AND NOT \"managerActive\")",
    );
    expect(query.sql).toContain(
      "editor.active AND editor.deleted_at IS NULL AND editor.role='editor'",
    );
  });
  it("rejects malformed client identifiers before touching the database", async () => {
    const execute = vi.fn(),
      db = { execute } as unknown as DatabaseClient;
    await expect(
      loadClientDetail(db, "invalid", new URLSearchParams()),
    ).rejects.toMatchObject({ status: 404 });
    expect(execute).not.toHaveBeenCalled();
  });
  it("never loads a detail pane for an account outside the eligible client directory", async () => {
    const execute = vi.fn().mockResolvedValue([]),
      db = { execute } as unknown as DatabaseClient;
    expect(
      await loadClientDetail(
        db,
        "11111111-1111-4111-8111-111111111111",
        new URLSearchParams(),
      ),
    ).toBeNull();
    expect(execute).toHaveBeenCalledOnce();
  });
});
