import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";
import { creatorProfiles } from "@edicut/db/schema";
import type { DatabaseClient } from "@edicut/db/client";
import { createPurchasedProject, resetCreatorProfile, saveCreatorProfile } from "./client-workspace.server";
import type { CreatorProfile, ProjectBrief } from "./client-intake";

const ownerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const subscriptionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const profile: CreatorProfile = {
  channelName: "Studio Channel", channelUrl: "https://youtube.com/@studio", brandUrl: "",
};
const brief: ProjectBrief = {
  title: "Launch video", objective: "Introduce the new channel", videoType: "YouTube video", finishedMinutes: 8,
  rawMinutes: 60, aspectRatio: "16:9", resolution: "1080p", deadline: "2026-10-20",
  footageUrl: "https://drive.google.com/file/d/abc", scriptUrl: "", referenceUrl: "", instructions: "Keep the pacing clear and friendly.",
  captions: "Burned-in", editingMinutes: 15,
};

describe("purchased project concurrency", () => {
  it.each([
    { purchaseType: "monthly", pendingMigration: false },
    { purchaseType: "single", pendingMigration: false },
    { purchaseType: "monthly", pendingMigration: true },
  ] as const)("preserves $purchaseType billing units (pending migration: $pendingMigration)", async ({ purchaseType, pendingMigration }) => {
    const selectResults = [
      [{ details: profile }],
      [{
        subscription: {
          id: subscriptionId, ownerId, packageSlug: purchaseType === "monthly" ? "creator-pro" : "single-creator", planName: "Studio", purchaseType,
          status: "paid", paidAt: new Date("2026-10-01T00:00:00.000Z"), deletedAt: null,
        },
        entitlement: { grantedUnits: 6600, usedUnits: 0 },
      }],
      [],
    ];
    let selectIndex = 0;
    const select = vi.fn(() => {
      const rows = selectResults[selectIndex++];
      const chain = {
        from: vi.fn().mockReturnThis(), leftJoin: vi.fn().mockReturnThis(), where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(rows), limit: vi.fn().mockResolvedValue(rows),
      };
      return chain;
    });
    const execute = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ project_id: "project-id" }]);
    if (pendingMigration) execute.mockReset().mockResolvedValueOnce([]).mockRejectedValueOnce({ cause: { code: "23514", constraint: "project_intakes_reserved_check" } });
    const db = { select, execute } as unknown as DatabaseClient;

    expect(await createPurchasedProject(db, ownerId, subscriptionId, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", brief)).toEqual(pendingMigration ? { error: expect.stringContaining("Your balance was not charged") } : { id: expect.any(String) });
    const compiled = new PgDialect().sqlToQuery(execute.mock.calls[1][0]);
    const query = compiled.sql;
    expect(query).toContain("WITH eligible AS MATERIALIZED");
    expect(query).toContain("FOR UPDATE OF s");
    expect(query).toContain("NULL::varchar, NULL::varchar");
    expect(query.indexOf("FOR UPDATE OF s")).toBeLessThan(query.indexOf("UPDATE purchase_entitlements"));
    expect(query).toContain("e.used_units < e.granted_units");
    const unitParameter = Number(query.match(/used_units = used_units \+ \$(\d+)/)![1]) - 1;
    expect(compiled.params[unitParameter]).toBe(purchaseType === "monthly" ? 0 : 1);
    const savedBrief = compiled.params.find(value => typeof value === "string" && value.startsWith('{"title":'));
    expect(JSON.parse(String(savedBrief))).toMatchObject({ editingMinutes: 0 });
    expect(compiled.params.some(value => typeof value === "string" && value.includes(purchaseType === "monthly" ? "no hours deducted at submission" : "Uses one purchased video credit"))).toBe(true);
  });
  it("preserves legacy channel fields when saving the reduced profile", async () => {
    const execute = vi.fn().mockResolvedValue([{ owner_id: ownerId }]);
    const db = { execute } as unknown as DatabaseClient;
    expect(await saveCreatorProfile(db, ownerId, profile)).toBe(true);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]).sql;
    expect(query).toContain("details = creator_profiles.details || EXCLUDED.details");
  });
});

describe("creator profile reset", () => {
  it("deletes only the profile row belonging to the selected user", async () => {
    const filters: SQL[] = [];
    const returning = vi.fn().mockResolvedValue([{ ownerId }]);
    const where = vi.fn((condition: SQL) => {
      filters.push(condition);
      return { returning };
    });
    const deleteFrom = vi.fn(() => ({ where }));
    const db = { delete: deleteFrom } as unknown as DatabaseClient;

    expect(await resetCreatorProfile(db, ownerId)).toBe(true);
    expect(deleteFrom).toHaveBeenCalledWith(creatorProfiles);
    expect(returning).toHaveBeenCalledOnce();

    const query = new PgDialect().sqlToQuery(filters[0]!);
    expect(query.sql).toContain("owner_id");
    expect(query.params).toEqual([ownerId]);
  });

  it("reports when the user has no saved profile", async () => {
    const returning = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ returning });
    const deleteFrom = vi.fn().mockReturnValue({ where });
    const db = { delete: deleteFrom } as unknown as DatabaseClient;

    expect(await resetCreatorProfile(db, ownerId)).toBe(false);
  });
});
