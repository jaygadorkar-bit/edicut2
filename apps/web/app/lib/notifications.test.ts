import { describe, expect, it } from "vitest";
import {
  mergeNotificationReads,
  mergeNotificationDismissals,
  notificationDayGroup,
  notificationTime,
  validNotificationDismissals,
  validNotificationReads,
} from "./notifications";
import { presentWorkspaceEvent } from "./notifications.server";
const now = Date.parse("2026-10-14T08:00:00Z"),
  id = "11111111-1111-4111-8111-111111111111";
const viewer = { id, role: "admin", admin: true, features: [] };
describe("notification read state and presentation", () => {
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
    ).toBe(`/site/node-logmin/subscriptions?status=paid&event=${id}`);
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
