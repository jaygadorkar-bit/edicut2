import type { DatabaseClient } from "@edicut/db/client";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { getAdminProfileImage } from "./admin-profile.server";

describe("admin profile photo lookup", () => {
  it("uses the matching email and current active admin identity, excluding trashed profiles", async () => {
    const where = vi.fn((_predicate: SQL) => ({ limit: async () => [{ email: "admin@example.test", imageUrl: "https://lh3.googleusercontent.com/avatar" }] }));
    const innerJoin = vi.fn((_table: unknown, _predicate: SQL) => ({ where }));
    const db = { select: vi.fn(() => ({ from: () => ({ innerJoin }) })) } as unknown as DatabaseClient;
    expect(await getAdminProfileImage(db, "admin-id")).toEqual({ email: "admin@example.test", imageUrl: "https://lh3.googleusercontent.com/avatar" });
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(innerJoin.mock.calls[0][1]).sql).toContain('lower("users"."email") = lower("admin_users"."email")');
    const filter = dialect.sqlToQuery(where.mock.calls[0][0]);
    expect(filter.params).toEqual(["admin-id", true, "admin"]);
    expect(filter.sql).toContain('"users"."deleted_at" is null');
  });
  it("returns no image for an absent identity without querying", async () => {
    const db = { select: vi.fn() } as unknown as DatabaseClient;
    expect(await getAdminProfileImage(db, undefined)).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });
});
