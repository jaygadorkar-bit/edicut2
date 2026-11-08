import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { DatabaseClient } from "@edicut/db/client";
import {
  getWorkspaceNotificationFeed,
  importUserWorkspaceEventReads,
  setAdminWorkspaceEventsRead,
  setUserWorkspaceEventsRead,
  type NotificationViewer,
} from "./notifications.server";
const connection = process.env.REVIEW_TEST_DATABASE_URL;
const id = (n: number) =>
  `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const admin: NotificationViewer = {
  id: id(9),
  admin: true,
  role: "admin",
  features: [],
};
const customer: NotificationViewer = {
  id: id(1),
  admin: false,
  role: "customer",
  features: ["projects", "reviews", "billing"],
};
const now = new Date("2026-10-14T08:00:00Z");
describe.skipIf(!connection)("notification PostgreSQL boundaries", () => {
  let client: ReturnType<typeof postgres>, db: DatabaseClient;
  beforeAll(async () => {
    const target = new URL(connection!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/edicut_review_test"
    )
      throw new Error("Use the dedicated disposable local database only.");
    client = postgres(connection!, { max: 1, onnotice: () => {} });
    await client.unsafe(
      "DROP SCHEMA IF EXISTS notification_validation CASCADE; CREATE SCHEMA notification_validation; SET search_path TO notification_validation",
    );
    await client.unsafe(`CREATE TABLE workspace_projects(id uuid PRIMARY KEY,owner_id uuid,title text,status text,created_at timestamptz DEFAULT '2026-10-14 06:00:00Z',updated_at timestamptz DEFAULT '2026-10-14 06:00:00Z');
      CREATE TABLE customer_subscriptions(id uuid PRIMARY KEY,owner_id uuid,plan_name text,status text,deleted_at timestamptz,created_at timestamptz DEFAULT '2026-10-14 06:00:00Z',paid_at timestamptz);
      CREATE TABLE contact_messages(id uuid PRIMARY KEY,name text,project_type text,created_at timestamptz DEFAULT '2026-10-14 06:00:00Z');
      CREATE TABLE custom_quotes(id uuid PRIMARY KEY,title text,created_at timestamptz DEFAULT '2026-10-14 06:00:00Z');
      CREATE TABLE project_review_members(project_id uuid,user_id uuid,id uuid DEFAULT gen_random_uuid(),created_at timestamptz DEFAULT '2026-10-14 06:00:00Z');
      CREATE TABLE users(id uuid PRIMARY KEY,name text,role text DEFAULT 'editor',active boolean DEFAULT true,deleted_at timestamptz);
      CREATE TABLE project_review_versions(id uuid PRIMARY KEY,project_id uuid,actor_key text,title text,decision text,created_at timestamptz DEFAULT '2026-10-14 06:01:00Z',updated_at timestamptz DEFAULT '2026-10-14 06:03:00Z');
      CREATE TABLE project_review_comments(id uuid PRIMARY KEY,version_id uuid,actor_key text,author_name text,parent_id uuid,category text,created_at timestamptz DEFAULT '2026-10-14 06:02:00Z');
      CREATE TABLE workspace_project_reviews(id uuid PRIMARY KEY,project_id uuid,decision text,created_at timestamptz DEFAULT '2026-10-14 06:03:00Z');`);
    await client.unsafe(`CREATE TABLE admin_workspace_event_reads(event_id varchar(180) NOT NULL,is_read boolean NOT NULL,read_at timestamptz,updated_at timestamptz NOT NULL,read_by uuid NOT NULL,PRIMARY KEY(event_id,read_by));`);
    await client.unsafe(`CREATE TABLE user_workspace_event_reads(event_id varchar(180) NOT NULL,is_read boolean NOT NULL,read_at timestamptz,updated_at timestamptz NOT NULL,user_id uuid NOT NULL,PRIMARY KEY(event_id,user_id));`);
    db = drizzle(client) as unknown as DatabaseClient;
  });
  afterAll(async () => {
    if (client) {
      await client.unsafe("DROP SCHEMA notification_validation CASCADE");
      await client.end();
    }
  });
  beforeEach(async () => {
    await client.unsafe(
      "TRUNCATE workspace_projects,customer_subscriptions,contact_messages,custom_quotes,project_review_members,project_review_versions,project_review_comments,workspace_project_reviews,admin_workspace_event_reads,user_workspace_event_reads",
    );
    await client`INSERT INTO workspace_projects(id,owner_id,title,status)VALUES(${id(101)},${id(1)},'Client one film','review'),(${id(102)},${id(2)},'Private client two film','intake')`;
    await client`INSERT INTO customer_subscriptions(id,owner_id,plan_name,status,paid_at)VALUES(${id(201)},${id(1)},'Growth','paid','2026-10-14 06:01:00Z'),(${id(202)},${id(2)},'Private Studio','unpaid',NULL)`;
    await client`INSERT INTO contact_messages(id,name,project_type)VALUES(${id(301)},'Enquirer','Podcast')`;
    await client`INSERT INTO custom_quotes(id,title)VALUES(${id(401)},'Private custom quote')`;
    await client`INSERT INTO project_review_versions(id,project_id,actor_key,title,decision)VALUES(${id(501)},${id(101)},${`user:${id(3)}`},'Second cut','changes_requested')`;
    await client`INSERT INTO project_review_comments(id,version_id,actor_key,author_name,category)VALUES(${id(601)},${id(501)},${`user:${id(1)}`},'Client one','change')`;
    await client`INSERT INTO workspace_project_reviews(id,project_id,decision)VALUES(${id(701)},${id(101)},'revision_requested')`;
  });
  it("includes new editing requests, orders, payments, enquiries, quotes and revision requests for administrators", async () => {
    const feed = await getWorkspaceNotificationFeed(db, admin, now);
    expect(new Set(feed.events.map((event) => event.kind))).toEqual(
      new Set(["project", "order", "payment", "enquiry", "quote", "review"]),
    );
    expect(
      feed.events.some((event) => event.title === "Changes requested"),
    ).toBe(true);
    expect(feed.partial).toBe(false);
  });
  it("persists admin read receipts independently across viewers", async () => {
    const original = await getWorkspaceNotificationFeed(db, admin, now);
    const target = original.events.find((event) => event.kind === "enquiry")!;
    const readAt = new Date("2026-10-14T08:01:00Z");
    await setAdminWorkspaceEventsRead(db, admin.id, [target.id], true, readAt);

    const otherAdmin = { ...admin, id: id(10) };
    const ownFeed = await getWorkspaceNotificationFeed(db, admin, now);
    expect(ownFeed.events.find((event) => event.id === target.id)).toMatchObject({
      readAt: readAt.toISOString(),
      readBy: admin.id,
    });

    const otherFeed = await getWorkspaceNotificationFeed(db, otherAdmin, now);
    expect(otherFeed.events.find((event) => event.id === target.id)).toMatchObject({
      readAt: null,
      readBy: null,
    });

    await setAdminWorkspaceEventsRead(db, otherAdmin.id, [target.id], false, readAt);
    const stillRead = await getWorkspaceNotificationFeed(db, admin, now);
    expect(stillRead.events.find((event) => event.id === target.id)?.readAt).toBe(readAt.toISOString());
  });
  it("keeps a newer receipt action when requests reach the database out of order", async () => {
    const original = await getWorkspaceNotificationFeed(db, admin, now);
    const target = original.events.find((event) => event.kind === "enquiry")!;
    const earlier = new Date("2026-10-14T08:01:00Z");
    const later = new Date("2026-10-14T08:02:00Z");

    await setAdminWorkspaceEventsRead(db, admin.id, [target.id], false, later);
    await setAdminWorkspaceEventsRead(db, admin.id, [target.id], true, earlier);
    const stillUnread = await getWorkspaceNotificationFeed(db, admin, now);
    expect(stillUnread.events.find((event) => event.id === target.id)?.readAt).toBeNull();

    await setAdminWorkspaceEventsRead(db, admin.id, [target.id], true, later);
    await setAdminWorkspaceEventsRead(db, admin.id, [target.id], false, earlier);
    const stillRead = await getWorkspaceNotificationFeed(db, admin, now);
    expect(stillRead.events.find((event) => event.id === target.id)?.readAt).toBe(later.toISOString());
  });
  it("persists client receipts across devices and protects newer read or unread state", async () => {
    const original = await getWorkspaceNotificationFeed(db, customer, now);
    const target = original.events.find((event) => event.kind === "order")!;
    const readAt = new Date("2026-10-14T08:01:00Z");
    await setUserWorkspaceEventsRead(db, customer.id, [target.id], true, readAt);

    const otherAccount = { ...customer, id: id(2) };
    await setUserWorkspaceEventsRead(db, otherAccount.id, [target.id], false, readAt);
    const ownFeed = await getWorkspaceNotificationFeed(db, customer, now);
    expect(ownFeed.events.find((event) => event.id === target.id)).toMatchObject({
      readAt: readAt.toISOString(),
      readBy: customer.id,
    });

    const importedAt = new Date("2026-10-14T08:02:00Z");
    const laterUnreadAt = new Date("2026-10-14T08:03:00Z");
    await setUserWorkspaceEventsRead(db, customer.id, [target.id], false, laterUnreadAt);
    await importUserWorkspaceEventReads(
      db,
      customer.id,
      [{ eventId: target.id, readAt: importedAt.toISOString() }],
      new Date("2026-10-14T08:04:00Z"),
    );
    const stillUnread = await getWorkspaceNotificationFeed(db, customer, now);
    expect(stillUnread.events.find((event) => event.id === target.id)?.readAt).toBeNull();
  });
  it("isolates customers and excludes their own review comments and restricted modules", async () => {
    const feed = await getWorkspaceNotificationFeed(db, customer, now);
    expect(feed.events.some((event) => event.detail.includes("Private"))).toBe(
      false,
    );
    expect(
      feed.events.some((event) => ["enquiry", "quote"].includes(event.kind)),
    ).toBe(false);
    expect(
      feed.events.some((event) => event.title === "New edit feedback"),
    ).toBe(false);
    expect(
      feed.events.some((event) => event.title === "New video version"),
    ).toBe(true);
  });
  it("requires explicit editor assignment and obeys removed feature access", async () => {
    const editor = {
      ...customer,
      id: id(3),
      role: "editor",
      features: ["projects", "reviews"],
    } as NotificationViewer;
    expect(
      (await getWorkspaceNotificationFeed(db, editor, now)).events,
    ).toHaveLength(0);
    await client`INSERT INTO project_review_members(project_id,user_id)VALUES(${id(101)},${id(3)})`;
    const assigned = await getWorkspaceNotificationFeed(db, editor, now);
    expect(
      assigned.events.some((event) => event.title === "New edit feedback"),
    ).toBe(true);
    expect(
      assigned.events.some((event) => event.detail.includes("Private")),
    ).toBe(false);
    expect(
      (await getWorkspaceNotificationFeed(db, { ...editor, features: [] }, now))
        .events,
    ).toHaveLength(0);
  });
  it("limits support accounts to their permitted inbox events", async () => {
    const feed = await getWorkspaceNotificationFeed(
      db,
      { ...customer, role: "customer_support", features: ["support"] },
      now,
    );
    expect(feed.events.map((event) => event.kind)).toEqual(["enquiry"]);
    expect(feed.kinds).toEqual(["enquiry"]);
  });
  it("bounds history and orders the latest 100 events deterministically", async () => {
    await client.unsafe(
      `INSERT INTO workspace_projects(id,owner_id,title,status,created_at)SELECT gen_random_uuid(),'${id(1)}','Recent '||n,'intake','2026-10-14 07:00:00Z'::timestamptz+n*interval '1 second' FROM generate_series(1,105)n`,
    );
    await client`INSERT INTO workspace_projects(id,owner_id,title,status,created_at)VALUES(${id(999)},${id(1)},'Too old','intake','2026-01-01Z')`;
    const feed = await getWorkspaceNotificationFeed(db, admin, now);
    expect(feed.events).toHaveLength(100);
    expect(feed.events[0].detail).toBe("Recent 105");
    expect(feed.events.at(-1)?.detail).toBe("Recent 6");
  });
  it("preserves baseline notifications when optional review tables are absent", async () => {
    await client.unsafe(
      "ALTER TABLE project_review_comments RENAME TO unavailable_comments",
    );
    try {
      const feed = await getWorkspaceNotificationFeed(db, admin, now);
      expect(feed.partial).toBe(true);
      expect(feed.unavailableKinds).toEqual(["review"]);
      expect(feed.events.some((event) => event.kind === "order")).toBe(true);
      expect(feed.events.some((event) => event.kind === "enquiry")).toBe(true);
    } finally {
      await client.unsafe(
        "ALTER TABLE unavailable_comments RENAME TO project_review_comments",
      );
    }
  });
});
