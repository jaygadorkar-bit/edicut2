import { sql, type SQL } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import type { DashboardFeature } from "./role-feature-access";
import { adminPath } from "./admin-paths";
import { isWorkspaceRecordId } from "./workspace";
import {
  notificationKinds,
  notificationDayGroup,
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
export type AdminWorkspaceEventReadRequest = { eventIds: string[]; read: boolean };
export type WorkspaceEventReadReceipt = { eventId: string; readAt: string };
export type WorkspaceEventReadResult = { eventIds: string[]; readAt: string | null; readBy: string | null };
export type AdminWorkspaceEventReadResult = WorkspaceEventReadResult;
type EventRow = {
  entityId: string;
  projectId?: string;
  projectTitle?: string;
  versionId?: string;
  kind: NotificationKind;
  title: string;
  detail: string;
  occurredAt: string | Date;
  status?: string;
  priority?: "action" | "important" | "normal";
  readAt?: string | Date | null;
  readBy?: string | null;
};
function resultRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    if (Array.isArray(rows)) return rows as Record<string, unknown>[];
  }
  return [];
}
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
    to = viewer.admin ? `${root}/orders?status=${row.status === "paid" ? "paid" : "unpaid"}&event=${row.entityId}` : `${root}/subscriptions?event=${row.entityId}`;
  if (row.kind === "enquiry") to = `/dashboard/messages?event=${row.entityId}`;
  if (row.kind === "quote") to = `${root}/quotes?event=${row.entityId}`;
  if (
    row.kind === "project" &&
    !viewer.admin &&
    !viewer.features.includes("reviews")
  )
    to = `/dashboard/projects?q=${encodeURIComponent((row.projectTitle || row.detail).slice(0, 120))}`;
  const priority = row.priority === "action" || row.priority === "important"
    ? row.priority
    : "normal";
  const needsEditor = row.kind === "project" && priority === "action";
  const actionLabel = needsEditor
    ? "Assign editor"
    : {
        project: "Open project",
        order: "View order",
        payment: "View payment",
        enquiry: "Open enquiry",
        quote: "Open quote",
        review: "Open feedback",
      }[row.kind];
  const actionTo = needsEditor
    ? viewer.admin
      ? adminPath("/projects?view=unassigned")
      : "/dashboard/projects?view=unassigned"
    : to;
  return {
    id: `${row.kind}:${row.entityId}:${at.toISOString()}:${row.title.slice(0, 30).replace(/[^a-z0-9]/gi, "")}`,
    kind: row.kind,
    title: row.title.slice(0, 160),
    detail: (row.detail || "").slice(0, 240),
    to,
    priority,
    actionLabel,
    actionTo,
    ...(row.projectId && ["project", "review"].includes(row.kind)
      ? {
          groupKey: `${row.kind}:${row.title}:${row.projectId}:${notificationDayGroup(at.toISOString())}`,
        }
      : {}),
    occurredAt: at.toISOString(),
    readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
    readBy: row.readBy ?? null,
  };
}

/** Persist each administrator's read state independently for every event. */
export async function setAdminWorkspaceEventsRead(
  db: DatabaseClient,
  adminId: string,
  eventIds: string[],
  read: boolean,
  now = new Date(),
): Promise<AdminWorkspaceEventReadResult> {
  const uniqueIds = [...new Set(eventIds)];
  if (!uniqueIds.length) return { eventIds: [], readAt: null, readBy: null };
  await db.execute(sql`DELETE FROM admin_workspace_event_reads WHERE updated_at < ${new Date(now.getTime() - NOTIFICATION_HISTORY_DAYS * 86_400_000).toISOString()}::timestamptz`);
  // Persist unread tombstones too, so an older, slower read request cannot
  // resurrect a receipt after a newer mark-unread action.
  const timestamp = now.toISOString();
  const values = sql.join(uniqueIds.map((eventId) => sql`(${eventId},${read},${read ? timestamp : null}::timestamptz,${timestamp}::timestamptz,${adminId}::uuid)`), sql`, `);
  await db.execute(sql`INSERT INTO admin_workspace_event_reads (event_id, is_read, read_at, updated_at, read_by) VALUES ${values}
    ON CONFLICT (event_id, read_by) DO UPDATE SET
      is_read=EXCLUDED.is_read,
      read_at=EXCLUDED.read_at,
      updated_at=EXCLUDED.updated_at
    WHERE EXCLUDED.updated_at >= admin_workspace_event_reads.updated_at`);
  return { eventIds: uniqueIds, readAt: read ? timestamp : null, readBy: read ? adminId : null };
}

/** Persist each client's read and unread state independently across devices. */
export async function setUserWorkspaceEventsRead(
  db: DatabaseClient,
  userId: string,
  eventIds: string[],
  read: boolean,
  now = new Date(),
): Promise<WorkspaceEventReadResult> {
  const uniqueIds = [...new Set(eventIds)];
  if (!uniqueIds.length) return { eventIds: [], readAt: null, readBy: null };
  await db.execute(sql`DELETE FROM user_workspace_event_reads WHERE updated_at < ${new Date(now.getTime() - NOTIFICATION_HISTORY_DAYS * 86_400_000).toISOString()}::timestamptz`);
  const timestamp = now.toISOString();
  const values = sql.join(uniqueIds.map((eventId) => sql`(${eventId},${read},${read ? timestamp : null}::timestamptz,${timestamp}::timestamptz,${userId}::uuid)`), sql`, `);
  await db.execute(sql`INSERT INTO user_workspace_event_reads (event_id, is_read, read_at, updated_at, user_id) VALUES ${values}
    ON CONFLICT (event_id, user_id) DO UPDATE SET
      is_read=EXCLUDED.is_read,
      read_at=EXCLUDED.read_at,
      updated_at=EXCLUDED.updated_at
    WHERE EXCLUDED.updated_at >= user_workspace_event_reads.updated_at`);
  return { eventIds: uniqueIds, readAt: read ? timestamp : null, readBy: read ? userId : null };
}

function validLegacyReceipts(receipts: WorkspaceEventReadReceipt[], now: Date) {
  const earliest = now.getTime() - NOTIFICATION_HISTORY_DAYS * 86_400_000;
  const latest = now.getTime();
  return [...new Map(receipts.flatMap((receipt) => {
    const readAt = Date.parse(receipt.readAt);
    if (!receipt.eventId || receipt.eventId.length > 180 || !Number.isFinite(readAt) || readAt < earliest || readAt > latest) return [];
    return [[receipt.eventId, { eventId: receipt.eventId, readAt: new Date(readAt).toISOString() }] as const];
  })).values()].slice(0, NOTIFICATION_FEED_LIMIT);
}

/** Import this browser's older receipts once, without overriding newer server state. */
export async function importAdminWorkspaceEventReads(
  db: DatabaseClient,
  adminId: string,
  receipts: WorkspaceEventReadReceipt[],
  now = new Date(),
) {
  const safeReceipts = validLegacyReceipts(receipts, now);
  if (!safeReceipts.length) return [];
  const values = sql.join(safeReceipts.map((receipt) => sql`(${receipt.eventId},true,${receipt.readAt}::timestamptz,${receipt.readAt}::timestamptz,${adminId}::uuid)`), sql`, `);
  const result = await db.execute(sql`INSERT INTO admin_workspace_event_reads (event_id, is_read, read_at, updated_at, read_by) VALUES ${values}
    ON CONFLICT (event_id, read_by) DO NOTHING
    RETURNING event_id AS "eventId"`);
  return resultRows(result).map((row) => String(row.eventId));
}

/** Import this browser's older client receipts without overriding server state. */
export async function importUserWorkspaceEventReads(
  db: DatabaseClient,
  userId: string,
  receipts: WorkspaceEventReadReceipt[],
  now = new Date(),
) {
  const safeReceipts = validLegacyReceipts(receipts, now);
  if (!safeReceipts.length) return [];
  const values = sql.join(safeReceipts.map((receipt) => sql`(${receipt.eventId},true,${receipt.readAt}::timestamptz,${receipt.readAt}::timestamptz,${userId}::uuid)`), sql`, `);
  const result = await db.execute(sql`INSERT INTO user_workspace_event_reads (event_id, is_read, read_at, updated_at, user_id) VALUES ${values}
    ON CONFLICT (event_id, user_id) DO NOTHING
    RETURNING event_id AS "eventId"`);
  return resultRows(result).map((row) => String(row.eventId));
}

async function attachAdminEventReadState(db: DatabaseClient, adminId: string, events: WorkspaceEvent[]) {
  if (!events.length) return true;
  const ids = sql.join(events.map((event) => sql`${event.id}`), sql`, `);
  let result: unknown;
  try {
    result = await db.execute(sql`SELECT event_id AS "eventId", read_at AS "readAt", read_by AS "readBy" FROM admin_workspace_event_reads WHERE is_read AND read_by=${adminId}::uuid AND event_id IN (${ids})`);
  } catch (error) {
    if (!missingRelation(error)) throw error;
    // Event reads were added after the original notification feed. A missing
    // migration must not make every notification unavailable.
    return false;
  }
  const receipts = new Map(resultRows(result).map((row) => [String(row.eventId), { readAt: new Date(row.readAt as string | Date).toISOString(), readBy: row.readBy == null ? null : String(row.readBy) }]));
  for (const event of events) {
    const receipt = receipts.get(event.id);
    event.readAt = receipt?.readAt ?? null;
    event.readBy = receipt?.readBy ?? null;
  }
  return true;
}

async function attachUserEventReadState(db: DatabaseClient, userId: string, events: WorkspaceEvent[]) {
  if (!events.length) return true;
  const ids = sql.join(events.map((event) => sql`${event.id}`), sql`, `);
  let result: unknown;
  try {
    result = await db.execute(sql`SELECT event_id AS "eventId", read_at AS "readAt" FROM user_workspace_event_reads WHERE is_read AND user_id=${userId}::uuid AND event_id IN (${ids})`);
  } catch (error) {
    if (!missingRelation(error)) throw error;
    return false;
  }
  const receipts = new Map(resultRows(result).map((row) => [String(row.eventId), new Date(row.readAt as string | Date).toISOString()]));
  for (const event of events) {
    event.readAt = receipts.get(event.id) ?? null;
    event.readBy = event.readAt ? userId : null;
  }
  return true;
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
  const canAssignEditors =
    viewer.admin ||
    (viewer.role === "project_manager" && viewer.features.includes("reviews"));
  const projectRequestPriority = canAssignEditors
    ? sql`CASE WHEN NOT EXISTS (SELECT 1 FROM project_review_members membership JOIN users editor ON editor.id=membership.user_id WHERE membership.project_id=p.id AND editor.active AND editor.deleted_at IS NULL AND editor.role='editor') THEN 'action' ELSE 'normal' END`
    : sql`'normal'`;
  const projectAccess = viewer.admin
    ? sql`true`
    : viewer.role === "project_manager"
      ? sql`EXISTS(SELECT 1 FROM client_project_managers assignment JOIN users manager ON manager.id=assignment.manager_id JOIN users client ON client.id=assignment.client_id WHERE assignment.client_id=p.owner_id AND assignment.manager_id=${viewer.id}::uuid AND manager.active AND manager.deleted_at IS NULL AND manager.role='project_manager' AND client.active AND client.deleted_at IS NULL AND client.role IN ('user','customer'))`
    : staff
      ? sql`EXISTS(SELECT 1 FROM project_review_members m WHERE m.project_id=p.id AND m.user_id=${viewer.id}::uuid)`
      : sql`p.owner_id=${viewer.id}::uuid`;
  if (viewer.admin || viewer.features.includes("projects")) {
    sourceKinds.push("project");
    sources.push(sql`SELECT m.id AS "entityId",p.id AS "projectId",p.title AS "projectTitle",'project' AS kind,CASE WHEN m.user_id=${viewer.id}::uuid THEN 'You were assigned a project' ELSE 'Editor assigned' END AS title,p.title || ' — ' || COALESCE(NULLIF(BTRIM(client.name),''),'Client') || ' — ' || COALESCE(NULLIF(BTRIM(u.name),''),'Editor') AS detail,'important' AS priority,m.created_at AS "occurredAt" FROM project_review_members m JOIN workspace_projects p ON p.id=m.project_id JOIN users u ON u.id=m.user_id JOIN users client ON client.id=p.owner_id WHERE ${projectAccess} AND u.active AND u.deleted_at IS NULL AND u.role='editor' AND ${time(sql`m.created_at`)} ORDER BY m.created_at DESC,m.id DESC LIMIT 100`);
    sourceKinds.push("project");
    sources.push(
      sql`SELECT p.id AS "entityId",p.title AS "projectTitle",'project' AS kind,'New editing request' AS title,CASE WHEN ${viewer.admin || viewer.role === "project_manager" ? sql`true` : sql`false`} THEN p.title || ' — ' || COALESCE(NULLIF(BTRIM(client.name),''),'Client') ELSE p.title END AS detail,${projectRequestPriority} AS priority,p.created_at AS "occurredAt" FROM workspace_projects p JOIN users client ON client.id=p.owner_id WHERE ${projectAccess} AND ${time(sql`p.created_at`)} ORDER BY p.created_at DESC,p.id DESC LIMIT 100`,
    );
    if (!viewer.admin) {
      sourceKinds.push("project");
      sources.push(
        sql`SELECT p.id AS "entityId",p.title AS "projectTitle",'project' AS kind,CASE p.status WHEN 'delivered' THEN 'Project delivered' WHEN 'revision' THEN 'Changes requested' WHEN 'review' THEN 'Project ready for review' ELSE 'Project updated' END AS title,p.title AS detail,p.updated_at AS "occurredAt" FROM workspace_projects p WHERE ${projectAccess} AND p.updated_at > p.created_at + interval '1 second' AND ${time(sql`p.updated_at`)} ORDER BY p.updated_at DESC,p.id DESC LIMIT 100`,
      );
    }
  }
  if (viewer.admin || viewer.features.includes("billing")) {
    const owner = viewer.admin ? sql`true` : sql`s.owner_id=${viewer.id}::uuid`;
    const subscriptionDetail = viewer.admin
      ? sql`concat_ws(' · ', s.plan_name, COALESCE(NULLIF(BTRIM(customer.name),''),'Customer'), customer.email, s.currency || ' ' || to_char(s.amount_cents::numeric / 100, 'FM999999990.00'))`
      : sql`s.plan_name`;
    const customerJoin = viewer.admin
      ? sql`JOIN users customer ON customer.id=s.owner_id`
      : sql``;
    sourceKinds.push("order", "payment");
    sources.push(
      sql`SELECT s.id AS "entityId",'order' AS kind,${viewer.admin ? "New order" : "Package selected"} AS title,${subscriptionDetail} AS detail,s.status,s.created_at AS "occurredAt" FROM customer_subscriptions s ${customerJoin} WHERE s.deleted_at IS NULL AND ${owner} AND ${time(sql`s.created_at`)} ORDER BY s.created_at DESC,s.id DESC LIMIT 100`,
    );
    sources.push(
      sql`SELECT s.id AS "entityId",'payment' AS kind,'Payment confirmed' AS title,${subscriptionDetail} AS detail,s.status,s.paid_at AS "occurredAt" FROM customer_subscriptions s ${customerJoin} WHERE s.deleted_at IS NULL AND s.status='paid' AND ${owner} AND ${time(sql`s.paid_at`)} ORDER BY s.paid_at DESC,s.id DESC LIMIT 100`,
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
    const rows = result.value as unknown as EventRow[];
    for (const row of rows) {
      const event = presentWorkspaceEvent(row, viewer);
      if (event) events.push(event);
    }
  }
  const unique = [
    ...new Map(events.map((event) => [event.id, event])).values(),
  ];
  const readReceiptsAvailable = viewer.admin
    ? await attachAdminEventReadState(db, viewer.id, unique)
    : await attachUserEventReadState(db, viewer.id, unique);
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
    ...(readReceiptsAvailable === undefined ? {} : { readReceiptsAvailable }),
    kinds: [...new Set(sourceKinds)],
  };
}
