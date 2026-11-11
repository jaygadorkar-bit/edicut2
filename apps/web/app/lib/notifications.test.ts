import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import { describe, expect, it, vi } from "vitest";
import {
  groupNotificationEvents,
  mergeNotificationReads,
  mergeNotificationDismissals,
  notificationEventForEntity,
  notificationDayGroup,
  notificationTime,
  validNotificationDismissals,
  validNotificationReads,
} from "./notifications";
import {
  getWorkspaceNotificationFeed,
  importUserWorkspaceEventReads,
  presentWorkspaceEvent,
  setUserWorkspaceEventsRead,
} from "./notifications.server";
const now = Date.parse("2026-10-14T08:00:00Z"),
  id = "11111111-1111-4111-8111-111111111111";
const viewer = { id, role: "admin", admin: true, features: [] };
describe("notification read state and presentation", () => {
  it("separates partner applications from enquiries and links them to recruiting forms", async () => {
    const timestamp = new Date(now).toISOString();
    const applicationId = "22222222-2222-4222-8222-222222222222";
    const dialect = new PgDialect();
    const execute = vi.fn(async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      if (query.sql.includes("FROM contact_messages") && query.sql.includes("'enquiry' AS kind")) {
        return [{ entityId: id, kind: "enquiry", title: "New enquiry", detail: "Creator — YouTube editing", occurredAt: timestamp }];
      }
      if (query.sql.includes("FROM contact_messages") && query.sql.includes("'recruiting' AS kind")) {
        return [{ entityId: applicationId, kind: "recruiting", title: "New partner application", detail: "Taylor Editor — taylor@example.test", occurredAt: timestamp }];
      }
      return [];
    });
    const db = { execute } as unknown as DatabaseClient;

    const feed = await getWorkspaceNotificationFeed(db, viewer, new Date(now));
    const enquiryQuery = execute.mock.calls.map(([statement]) => dialect.sqlToQuery(statement).sql).find((query) => query.includes("'enquiry' AS kind"));
    const recruitingQuery = execute.mock.calls.map(([statement]) => dialect.sqlToQuery(statement).sql).find((query) => query.includes("'recruiting' AS kind"));
    const application = feed.events.find((event) => event.kind === "recruiting");

    expect(enquiryQuery).toContain("project_type IS DISTINCT FROM");
    expect(recruitingQuery).toContain("project_type=");
    expect(feed.kinds).toContain("recruiting");
    expect(feed.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "enquiry", title: "New enquiry", to: `/dashboard/messages?event=${id}` }),
    ]));
    expect(application).toMatchObject({
      kind: "recruiting",
      title: "New partner application",
      to: "/site/node-logmin/recruiting-forms",
      actionLabel: "Review application",
    });
    expect(notificationEventForEntity(feed.events, "recruiting", applicationId)).toBe(application);
    expect(notificationEventForEntity(feed.events, "recruiting", id)).toBeUndefined();
    expect(notificationEventForEntity(feed.events, "enquiry", applicationId)).toBeUndefined();
    expect(feed.events.some((event) => event.kind === "enquiry" && event.detail.includes("partner application"))).toBe(false);
  });

  it("runs notification raw SQL with prepared statements on Postgres.js", async () => {
    const unsafe = vi.fn(async (..._args: unknown[]) => []);
    const db = {
      dialect: new PgDialect(),
      $client: { unsafe },
    } as unknown as DatabaseClient;

    await getWorkspaceNotificationFeed(
      db,
      { id, role: "customer", admin: false, features: ["projects"] },
      new Date(now),
    );

    expect(unsafe).toHaveBeenCalledTimes(3);
    expect(
      unsafe.mock.calls.every(([, , options]) =>
        (options as { prepare?: boolean } | undefined)?.prepare === true,
      ),
    ).toBe(true);
    expect(unsafe.mock.calls[0]?.[0]).toContain("FROM project_review_members");
  });

  it("loads only the current admin's persisted event receipts", async () => {
    const timestamp = new Date(now).toISOString();
    const otherAdminId = "22222222-2222-4222-8222-222222222222";
    const eventId = id;
    const dialect = new PgDialect();
    const execute = vi.fn(async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      if (query.sql.includes("FROM project_review_members")) {
        return [{
          entityId: eventId,
          projectId: eventId,
          kind: "project",
          title: "Editor assigned",
          detail: "Film — Client — Editor",
          priority: "important",
          occurredAt: timestamp,
        }];
      }
      if (query.sql.includes("FROM admin_workspace_event_reads")) {
        const owner = query.params.find((value) => value === id || value === otherAdminId);
        return owner === id
          ? [{ eventId: `project:${eventId}:${timestamp}:Editorassigned`, readAt: timestamp, readBy: id }]
          : [];
      }
      return [];
    });
    const db = { execute } as unknown as DatabaseClient;
    const baseViewer = { id, role: "admin", admin: true, features: [] };

    const ownFeed = await getWorkspaceNotificationFeed(db, baseViewer, new Date(now));
    const otherFeed = await getWorkspaceNotificationFeed(db, { ...baseViewer, id: otherAdminId }, new Date(now));

    expect(ownFeed.events[0]).toMatchObject({ readAt: timestamp, readBy: id });
    expect(otherFeed.events[0]).toMatchObject({ readAt: null, readBy: null });
    const receiptQueries = execute.mock.calls
      .map(([statement]) => dialect.sqlToQuery(statement).sql)
      .filter((query) => query.includes("FROM admin_workspace_event_reads"));
    expect(receiptQueries).toHaveLength(2);
    expect(receiptQueries.every((query) => /read_by\s*=/.test(query))).toBe(true);
  });
  it("loads client receipts from PostgreSQL for only the current account", async () => {
    const timestamp = new Date(now).toISOString();
    const otherUserId = "33333333-3333-4333-8333-333333333333";
    const entityId = "44444444-4444-4444-8444-444444444444";
    const eventId = `project:${entityId}:${timestamp}:Neweditingrequest`;
    const dialect = new PgDialect();
    const execute = vi.fn(async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement);
      if (query.sql.includes("FROM workspace_projects p JOIN users client")) {
        return [{
          entityId,
          projectTitle: "Client project",
          kind: "project",
          title: "New editing request",
          detail: "Client project",
          priority: "normal",
          occurredAt: timestamp,
        }];
      }
      if (query.sql.includes("FROM user_workspace_event_reads")) {
        const owner = query.params.find((value) => value === id || value === otherUserId);
        return owner === id ? [{ eventId, readAt: timestamp }] : [];
      }
      return [];
    });
    const db = { execute } as unknown as DatabaseClient;
    const clientViewer = { id, role: "customer", admin: false, features: ["projects"] };

    const ownFeed = await getWorkspaceNotificationFeed(db, clientViewer, new Date(now));
    const otherFeed = await getWorkspaceNotificationFeed(db, { ...clientViewer, id: otherUserId }, new Date(now));

    expect(ownFeed.readReceiptsAvailable).toBe(true);
    expect(ownFeed.events[0]).toMatchObject({ readAt: timestamp, readBy: id });
    expect(otherFeed.events[0]).toMatchObject({ readAt: null, readBy: null });
    const receiptQueries = execute.mock.calls
      .map(([statement]) => dialect.sqlToQuery(statement).sql)
      .filter((query) => query.includes("FROM user_workspace_event_reads"));
    expect(receiptQueries).toHaveLength(2);
    expect(receiptQueries.every((query) => /user_id\s*=/.test(query))).toBe(true);
  });
  it("writes client receipts with account scoping and version-safe updates", async () => {
    const dialect = new PgDialect();
    const execute = vi.fn(async (_statement: SQL): Promise<Record<string, unknown>[]> => []);
    const db = { execute } as unknown as DatabaseClient;
    const timestamp = new Date(now);
    const result = await setUserWorkspaceEventsRead(db, id, ["order:event"], false, timestamp);
    expect(result).toMatchObject({ eventIds: ["order:event"], readAt: null, readBy: null });
    const updateQuery = dialect.sqlToQuery(execute.mock.calls[1]![0] as SQL);
    expect(updateQuery.sql).toContain("INSERT INTO user_workspace_event_reads");
    expect(updateQuery.sql).toContain("ON CONFLICT (event_id, user_id) DO UPDATE");
    expect(updateQuery.sql).toContain("WHERE EXCLUDED.updated_at >= user_workspace_event_reads.updated_at");
    expect(updateQuery.params).toContain(id);

    execute.mockResolvedValueOnce([{ eventId: "order:event" }]);
    const imported = await importUserWorkspaceEventReads(
      db,
      id,
      [{ eventId: "order:event", readAt: new Date(now - 1_000).toISOString() }],
      new Date(now),
    );
    expect(imported).toEqual(["order:event"]);
    const importQuery = dialect.sqlToQuery(execute.mock.calls.at(-1)![0] as SQL);
    expect(importQuery.sql).toContain("ON CONFLICT (event_id, user_id) DO NOTHING");
    expect(importQuery.sql).toContain("RETURNING event_id");
  });
  it("groups same-project updates, keeps the latest destination, and raises action-needed groups", () => {
    const latest = new Date(now).toISOString();
    const grouped = groupNotificationEvents([
      {
        id: "older", kind: "project", title: "New editing request",
        detail: "Film — Client", to: "/project/one",
        occurredAt: new Date(now - 60_000).toISOString(), priority: "normal",
        groupKey: "project:one:today",
      },
      {
        id: "action", kind: "project", title: "New editing request",
        detail: "Studio — Client", to: "/project/two",
        actionTo: "/projects?view=unassigned", occurredAt: latest,
        priority: "action", groupKey: "project:two:today",
      },
      {
        id: "newer", kind: "project", title: "New editing request",
        detail: "Film — Client", to: "/project/one?version=1",
        occurredAt: latest, priority: "important",
        groupKey: "project:one:today",
      },
    ]);

    expect(grouped[0]).toMatchObject({
      id: "project:two:today", priority: "action", events: [{ id: "action" }],
    });
    expect(grouped[1]).toMatchObject({
      id: "project:one:today", priority: "important",
      events: [{ id: "newer" }, { id: "older" }],
    });
  });
  it("rejects corrupt, future, expired, and oversized read state", () => {
    expect(
      validNotificationReads(
        {
          a: now,
          b: "read",
          c: now + 120000,
          d: now - 91 * 86400000,
          ["x".repeat(181)]: now,
        },
        now,
      ),
    ).toEqual({ a: now });
    expect(
      Object.keys(
        validNotificationReads(
          Object.fromEntries(
            Array.from({ length: 1200 }, (_, n) => [`event${n}`, now - n]),
          ),
          now,
        ),
      ),
    ).toHaveLength(1000);
    expect(validNotificationReads(null, now)).toEqual({});
  });
  it("merges reads from other browser tabs without losing earlier acknowledgments", () => {
    expect(mergeNotificationReads({ a: now - 1 }, { b: now }, now)).toEqual({
      b: now,
      a: now - 1,
    });
  });
  it("keeps bounded, recent notification dismissals separate from read state", () => {
    expect(validNotificationDismissals({
      removed: now,
      corrupt: "deleted",
      future: now + 120_000,
      expired: now - 91 * 86400000,
      ["x".repeat(181)]: now,
    }, now)).toEqual({ removed: now });
    expect(mergeNotificationDismissals({ old: now - 1 }, { recent: now }, now)).toEqual({
      recent: now,
      old: now - 1,
    });
  });
  it("uses a distinct key for separate lifecycle events in the same millisecond", () => {
    const base = {
      entityId: id,
      kind: "review" as const,
      detail: "Film",
      occurredAt: new Date(now),
    };
    expect(
      presentWorkspaceEvent({ ...base, title: "New video version" }, viewer)
        ?.id,
    ).not.toBe(
      presentWorkspaceEvent({ ...base, title: "Video approved" }, viewer)?.id,
    );
  });
  it("generates exact-record internal links and rejects invalid identifiers", () => {
    expect(
      presentWorkspaceEvent(
        {
          entityId: id,
          kind: "order",
          title: "Order",
          detail: "Growth",
          status: "paid",
          occurredAt: new Date(now),
        },
        viewer,
      )?.to,
    ).toBe(`/site/node-logmin/orders?status=paid&event=${id}`);
    expect(
      presentWorkspaceEvent(
        {
          entityId: "javascript:alert(1)",
          kind: "enquiry",
          title: "Enquiry",
          detail: "",
          occurredAt: new Date(now),
        },
        viewer,
      ),
    ).toBeNull();
    expect(
      presentWorkspaceEvent(
        {
          entityId: id,
          kind: "review",
          projectId: "../bad",
          title: "Feedback",
          detail: "",
          occurredAt: new Date(now),
        },
        viewer,
      ),
    ).toBeNull();
  });
  it("links project-only accounts to their permitted project library", () => {
    const event = presentWorkspaceEvent(
      {
        entityId: id,
        kind: "project",
        title: "New editing request",
        detail: "Launch & film",
        occurredAt: new Date(now),
      },
      { id, admin: false, role: "customer", features: ["projects"] },
    );
    expect(event?.to).toBe("/dashboard/projects?q=Launch%20%26%20film");
  });
  it("adds direct assignment and project actions to important project notifications", () => {
    const request = presentWorkspaceEvent(
      {
        entityId: id, projectId: id, kind: "project",
        title: "New editing request", detail: "Launch film — Client",
        priority: "action", occurredAt: new Date(now).toISOString(),
      },
      viewer,
    );
    const assignment = presentWorkspaceEvent(
      {
        entityId: id, projectId: id, kind: "project", title: "Editor assigned",
        detail: "Launch film — Client — Editor", priority: "important",
        occurredAt: new Date(now).toISOString(),
      },
      viewer,
    );

    expect(request).toMatchObject({
      priority: "action", actionLabel: "Assign editor",
      actionTo: "/site/node-logmin/projects?view=unassigned",
    });
    expect(assignment).toMatchObject({
      priority: "important", actionLabel: "Open project",
      actionTo: `/site/node-logmin/projects/${id}`,
    });
    expect(
      presentWorkspaceEvent(
        {
          entityId: id, projectId: id, kind: "project",
          title: "New editing request", detail: "Launch film — Client",
          priority: "action", occurredAt: new Date(now).toISOString(),
        },
        { id, role: "project_manager", admin: false, features: ["projects", "reviews"] },
      ),
    ).toMatchObject({
      actionLabel: "Assign editor",
      actionTo: "/dashboard/projects?view=unassigned",
    });
  });
  it("formats relative time and older dates in the product business timezone", () => {
    expect(notificationTime(new Date(now - 10000).toISOString(), now)).toBe(
      "Just now",
    );
    expect(notificationTime(new Date(now - 120000).toISOString(), now)).toBe(
      "2m ago",
    );
    expect(notificationTime("2026-10-12T23:00:00Z", now)).toBe("13 Oct");
  });
  it("groups notification dates by the product timezone, including midnight boundaries", () => {
    const reference = Date.parse("2026-10-15T01:00:00Z");
    expect(notificationDayGroup("2026-10-14T18:00:00Z", reference)).toBe(
      "Today",
    );
    expect(notificationDayGroup("2026-10-14T17:59:00Z", reference)).toBe(
      "Yesterday",
    );
    expect(notificationDayGroup("2026-10-10T00:00:00Z", reference)).toBe(
      "10 Oct 2026",
    );
    expect(notificationDayGroup("not-a-date", reference)).toBe("Earlier");
  });
});
