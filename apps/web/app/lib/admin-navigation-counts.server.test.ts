import type { DatabaseClient } from "@edicut/db/client";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import { getAdminNavigationCounts } from "./admin-navigation-counts.server";

describe("admin notification counts", () => {
  it("excludes paid/deleted orders and enquiries already read or replied to", async () => {
    const where = vi.fn().mockResolvedValueOnce([{ count: "3" }]).mockResolvedValueOnce([{ count: "7" }]);
    const from = vi.fn(() => ({ where }));
    const db = { select: vi.fn(() => ({ from })) } as unknown as DatabaseClient;
    expect(await getAdminNavigationCounts(db)).toEqual({ pendingOrderCount: 3, unreadEnquiryCount: 7 });
    const dialect = new PgDialect();
    const orders = dialect.sqlToQuery(where.mock.calls[0][0]);
    expect(orders.sql).toContain('"customer_subscriptions"."deleted_at" is null');
    expect(orders.sql).toContain('"customer_subscriptions"."status" =');
    expect(orders.params).toEqual(["unpaid"]);
    const enquiries = dialect.sqlToQuery(where.mock.calls[1][0]);
    expect(enquiries.sql).toContain('"contact_messages"."replied_at" is null');
    expect(enquiries.sql).toContain('"contact_messages"."status" <>');
    expect(enquiries.params).toEqual(["read"]);
  });
});
