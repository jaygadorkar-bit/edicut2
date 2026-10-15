import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import type { DatabaseClient } from "@edicut/db/client";
import {
  getWorkspaceNotificationFeed,
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
      "TRUNCATE workspace_projects,customer_subscriptions,contact_messages,custom_quotes,project_review_members,project_review_versions,project_review_comments,workspace_project_reviews",
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
