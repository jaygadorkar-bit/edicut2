import type { DatabaseClient } from "@edicut/db/client";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { getAdminNavigationCounts } from "./admin-navigation-counts.server";

describe("admin notification counts", () => {
  it("excludes paid/deleted orders, read/replied enquiries, and partner applications", async () => {
    const execute = vi.fn().mockResolvedValue([{ pendingOrderCount: "3", unreadEnquiryCount: "7" }]);
    const db = { execute } as unknown as DatabaseClient;
    expect(await getAdminNavigationCounts(db)).toEqual({ pendingOrderCount: 3, unreadEnquiryCount: 7 });
    const dialect = new PgDialect();
    expect(execute).toHaveBeenCalledOnce();
    const orders = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(orders.sql).toContain('"customer_subscriptions"."deleted_at" IS NULL');
    expect(orders.sql).toContain('"customer_subscriptions"."status" =');
    expect(orders.sql).toContain("= 'unpaid'");
    expect(orders.sql).toContain('"contact_messages"."replied_at" IS NULL');
    expect(orders.sql).toContain('"contact_messages"."status" <>');
    expect(orders.sql).toContain("<> 'read'");
    expect(orders.sql.toLowerCase()).toContain('"contact_messages"."project_type" is null');
    expect(orders.sql).toContain('"contact_messages"."project_type" <>');
    expect(orders.params).toContain("Video editor partner application");
  });
});
