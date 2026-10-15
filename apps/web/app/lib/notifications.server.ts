import { sql, type SQL } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import type { DashboardFeature } from "./role-feature-access";
import { adminPath } from "./admin-paths";
import { isWorkspaceRecordId } from "./workspace";
import {
  notificationKinds,
  NOTIFICATION_FEED_LIMIT,
  NOTIFICATION_HISTORY_DAYS,
  type NotificationFeed,
  type NotificationKind,
  type WorkspaceEvent,
} from "./notifications";

export type NotificationViewer = {
  id: string;
  admin: boolean;
  role: string;
  features: DashboardFeature[];
};
type EventRow = {
  entityId: string;
  projectId?: string;
  versionId?: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  occurredAt: string | Date;
  status?: string;
};
function missingRelation(error: unknown) {
  const seen = new Set();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const item = error as { code?: string; cause?: unknown };
    if (item.code === "42P01") return true;
    error = item.cause;
  }
  return false;
}
export function presentWorkspaceEvent(
  row: EventRow,
  viewer: NotificationViewer,
): WorkspaceEvent | null {
  if (
    !isWorkspaceRecordId(row.entityId) ||
    !Object.hasOwn(notificationKinds, row.kind)
  )
    return null;
  const at = new Date(row.occurredAt);
  if (!Number.isFinite(at.getTime())) return null;
  const root = viewer.admin ? adminPath("") : "/dashboard";
  let to = `${root}/projects/${row.projectId || row.entityId}`;
  if (row.projectId && !isWorkspaceRecordId(row.projectId)) return null;
  if (row.versionId) {
    if (!isWorkspaceRecordId(row.versionId)) return null;
    to += `?version=${row.versionId}`;
  }
  if (row.kind === "order" || row.kind === "payment")
    to = `${root}/subscriptions?${viewer.admin ? `status=${row.status === "paid" ? "paid" : "unpaid"}&` : ""}event=${row.entityId}`;
  if (row.kind === "enquiry") to = `/dashboard/messages?event=${row.entityId}`;
  if (row.kind === "quote") to = `${root}/quotes?event=${row.entityId}`;
  if (
    row.kind === "project" &&
    !viewer.admin &&
    !viewer.features.includes("reviews")
  )
    to = `/dashboard/projects?q=${encodeURIComponent(row.detail.slice(0, 120))}`;
  return {
    id: `${row.kind}:${row.entityId}:${at.toISOString()}:${row.title.slice(0, 30).replace(/[^a-z0-9]/gi, "")}`,
    kind: row.kind,
    title: row.title.slice(0, 160),
    detail: (row.detail || "").slice(0, 240),
    to,
    occurredAt: at.toISOString(),
  };
}
/** Read only the current viewer's sources. Missing optional modules never hide other event types. */
export async function getWorkspaceNotificationFeed(
  db: DatabaseClient,
  viewer: NotificationViewer,
  now = new Date(),
): Promise<NotificationFeed> {
  const since = new Date(
    now.getTime() - NOTIFICATION_HISTORY_DAYS * 86400_000,
  ).toISOString();
  const until = now.toISOString();
  const sources: SQL[] = [];
  const sourceKinds: NotificationKind[] = [];
  const time = (field: SQL) =>
    sql`${field} >= ${since}::timestamptz AND ${field} <= ${until}::timestamptz`;
  const staff = ["editor", "project_manager"].includes(viewer.role);
  const projectAccess = viewer.admin || viewer.role === "project_manager"
    ? sql`true`
    : staff
      ? sql`EXISTS(SELECT 1 FROM project_review_members m WHERE m.project_id=p.id AND m.user_id=${viewer.id}::uuid)`
      : sql`p.owner_id=${viewer.id}::uuid`;
  if (viewer.admin || viewer.features.includes("projects")) {
    sourceKinds.push("project");
    sources.push(sql`SELECT m.id AS "entityId",p.id AS "projectId",'project' AS kind,CASE WHEN m.user_id=${viewer.id}::uuid THEN 'You were assigned a project' ELSE 'Editor assigned' END AS title,p.title || ' — ' || COALESCE(u.name,'Editor') AS detail,m.created_at AS "occurredAt" FROM project_review_members m JOIN workspace_projects p ON p.id=m.project_id JOIN users u ON u.id=m.user_id WHERE ${projectAccess} AND u.active AND u.deleted_at IS NULL AND u.role='editor' AND ${time(sql`m.created_at`)} ORDER BY m.created_at DESC,m.id DESC LIMIT 100`);
    sourceKinds.push("project");
    sources.push(
      sql`SELECT p.id AS "entityId",'project' AS kind,'New editing request' AS title,p.title AS detail,p.created_at AS "occurredAt" FROM workspace_projects p WHERE ${projectAccess} AND ${time(sql`p.created_at`)} ORDER BY p.created_at DESC,p.id DESC LIMIT 100`,
    );
    if (!viewer.admin) {
      sourceKinds.push("project");
      sources.push(
        sql`SELECT p.id AS "entityId",'project' AS kind,CASE p.status WHEN 'delivered' THEN 'Project delivered' WHEN 'revision' THEN 'Changes requested' WHEN 'review' THEN 'Project ready for review' ELSE 'Project updated' END AS title,p.title AS detail,p.updated_at AS "occurredAt" FROM workspace_projects p WHERE ${projectAccess} AND p.updated_at > p.created_at + interval '1 second' AND ${time(sql`p.updated_at`)} ORDER BY p.updated_at DESC,p.id DESC LIMIT 100`,
      );
    }
  }
  if (viewer.admin || viewer.features.includes("billing")) {
    const owner = viewer.admin ? sql`true` : sql`s.owner_id=${viewer.id}::uuid`;
    sourceKinds.push("order", "payment");
    sources.push(
      sql`SELECT s.id AS "entityId",'order' AS kind,${viewer.admin ? "New order" : "Package selected"} AS title,s.plan_name AS detail,s.status,s.created_at AS "occurredAt" FROM customer_subscriptions s WHERE s.deleted_at IS NULL AND ${owner} AND ${time(sql`s.created_at`)} ORDER BY s.created_at DESC,s.id DESC LIMIT 100`,
    );
    sources.push(
      sql`SELECT s.id AS "entityId",'payment' AS kind,'Payment confirmed' AS title,s.plan_name AS detail,s.status,s.paid_at AS "occurredAt" FROM customer_subscriptions s WHERE s.deleted_at IS NULL AND s.status='paid' AND ${owner} AND ${time(sql`s.paid_at`)} ORDER BY s.paid_at DESC,s.id DESC LIMIT 100`,
    );
  }
  if (viewer.admin || viewer.features.includes("support")) {
    sourceKinds.push("enquiry");
    sources.push(
      sql`SELECT id AS "entityId",'enquiry' AS kind,'New enquiry' AS title,name || CASE WHEN project_type IS NULL THEN '' ELSE ' — ' || project_type END AS detail,created_at AS "occurredAt" FROM contact_messages WHERE ${time(sql`created_at`)} ORDER BY created_at DESC,id DESC LIMIT 100`,
    );
  }
  // Only administrators can open the quote administration area.
  if (viewer.admin) {
    sourceKinds.push("quote");
    sources.push(
      sql`SELECT id AS "entityId",'quote' AS kind,'New custom quote request' AS title,title AS detail,created_at AS "occurredAt" FROM custom_quotes WHERE ${time(sql`created_at`)} ORDER BY created_at DESC,id DESC LIMIT 100`,
    );
  }
  if (
    viewer.admin ||
    (viewer.features.includes("projects") &&
      viewer.features.includes("reviews"))
  ) {
    const actorKey = `${viewer.admin ? "admin" : "user"}:${viewer.id}`;
    sourceKinds.push("review", "review", "review", "review");
    sources.push(
      sql`SELECT v.id AS "entityId",p.id AS "projectId",v.id AS "versionId",'review' AS kind,'New video version' AS title,p.title || ' — ' || v.title AS detail,v.created_at AS "occurredAt" FROM project_review_versions v JOIN workspace_projects p ON p.id=v.project_id WHERE ${projectAccess} AND v.actor_key<>${actorKey} AND ${time(sql`v.created_at`)} ORDER BY v.created_at DESC,v.id DESC LIMIT 100`,
    );
    sources.push(
      sql`SELECT c.id AS "entityId",p.id AS "projectId",v.id AS "versionId",'review' AS kind,CASE WHEN c.parent_id IS NOT NULL THEN 'New feedback reply' WHEN c.category='change' THEN 'New edit feedback' ELSE 'New video feedback' END AS title,p.title || ' — ' || c.author_name AS detail,c.created_at AS "occurredAt" FROM project_review_comments c JOIN project_review_versions v ON v.id=c.version_id JOIN workspace_projects p ON p.id=v.project_id WHERE ${projectAccess} AND c.actor_key<>${actorKey} AND ${time(sql`c.created_at`)} ORDER BY c.created_at DESC,c.id DESC LIMIT 100`,
    );
    sources.push(
      sql`SELECT v.id AS "entityId",p.id AS "projectId",v.id AS "versionId",'review' AS kind,CASE WHEN v.decision='approved' THEN 'Video approved' ELSE 'Changes requested' END AS title,p.title AS detail,v.updated_at AS "occurredAt" FROM project_review_versions v JOIN workspace_projects p ON p.id=v.project_id WHERE ${projectAccess} AND v.decision<>'pending' AND ${viewer.admin || staff ? sql`true` : sql`false`} AND ${time(sql`v.updated_at`)} ORDER BY v.updated_at DESC,v.id DESC LIMIT 100`,
    );
    sources.push(
      sql`SELECT r.id AS "entityId",p.id AS "projectId",'review' AS kind,CASE WHEN r.decision='approved' THEN 'Video approved' ELSE 'Changes requested' END AS title,p.title AS detail,r.created_at AS "occurredAt" FROM workspace_project_reviews r JOIN workspace_projects p ON p.id=r.project_id WHERE ${projectAccess} AND ${viewer.admin || staff ? sql`true` : sql`false`} AND ${time(sql`r.created_at`)} ORDER BY r.created_at DESC,r.id DESC LIMIT 100`,
    );
  }
  const results = await Promise.allSettled(
    sources.map((query) => db.execute(query)),
  );
  let partial = false;
  const unavailableKinds = new Set<NotificationKind>();
  const events: WorkspaceEvent[] = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      if (missingRelation(result.reason)) {
        partial = true;
        unavailableKinds.add(sourceKinds[index]);
        continue;
      }
      throw result.reason;
    }
    const rows = (
      Array.isArray(result.value) ? result.value : result.value.rows
    ) as EventRow[];
    for (const row of rows) {
      const event = presentWorkspaceEvent(row, viewer);
      if (event) events.push(event);
    }
  }
  const unique = [
    ...new Map(events.map((event) => [event.id, event])).values(),
  ];
  unique.sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
  );
  return {
    identity: `${viewer.admin ? "admin" : "user"}:${viewer.id}`,
    events: unique.slice(0, NOTIFICATION_FEED_LIMIT),
    generatedAt: until,
    partial,
    unavailableKinds: [...unavailableKinds],
    kinds: [...new Set(sourceKinds)],
  };
}
