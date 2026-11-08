import type { DatabaseClient } from "@edicut/db/client";
import { sql } from "drizzle-orm";
import { getPositivePage } from "./admin-data-requirements";
import { isWorkspaceRecordId } from "./workspace";
import { reviewRows } from "./project-review.server";
import {
  CLIENT_DETAIL_PAGE_SIZE,
  CLIENT_EVENT_PAGE_SIZE,
  CLIENT_PAGE_SIZE,
  type ClientDetail,
  type ClientDirectory,
  type ClientFilters,
} from "./admin-clients";

export function clientFilters(params: URLSearchParams): ClientFilters {
  const payment = params.get("payment") || "all",
    attention = params.get("attention") || "all";
  const manager = params.get("manager") || "all",
    sort = params.get("sort") || "attention";
  return {
    q: (params.get("q") || "").trim().slice(0, 120),
    payment: ["paid", "unpaid", "pending", "no-orders"].includes(payment)
      ? (payment as ClientFilters["payment"])
      : "all",
    attention: ["needs-manager", "needs-editor", "overdue", "review"].includes(
      attention,
    )
      ? (attention as ClientFilters["attention"])
      : "all",
    manager:
      manager === "unassigned" || isWorkspaceRecordId(manager)
        ? manager
        : "all",
    sort: sort === "recent" || sort === "name" ? sort : "attention",
    page: Math.min(getPositivePage(params.get("page")), 100_000),
  };
}

// Client roles are explicit: staff, affiliate marketers and trashed accounts
// belong in Role manager, never in the client operations directory.
const clientRollup = (selectedId?: string) => sql`
  SELECT u.id,u.name,u.email,u.active,u.country,u.phone,u.created_at AS "createdAt",
    assignment.manager_id AS "managerId",manager.name AS "managerName",
    COALESCE(manager.active AND manager.deleted_at IS NULL AND manager.role='project_manager',false) AS "managerActive",
    orders.paid AS "paidOrders",orders.pending AS "pendingOrders",orders.total AS "orderCount",
    projects.total AS "projectCount",projects.active AS "activeProjects",projects.review AS "reviewProjects",
    projects.paid AS "paidProjects",projects.invoices AS "pendingInvoices",
    projects.overdue AS "overdueProjects",projects.unassigned AS "needsEditor",feedback.total AS "unresolvedFeedback",
    projects.deadline AS "nextDeadline",
    greatest(u.created_at,orders.updated,projects.updated,assignment.assigned_at) AS "lastActivity"
  FROM users u
  LEFT JOIN client_project_managers assignment ON assignment.client_id=u.id
  LEFT JOIN users manager ON manager.id=assignment.manager_id
  CROSS JOIN LATERAL (
    SELECT count(*)::integer total,count(*) FILTER(WHERE s.status='paid')::integer paid,
      count(*) FILTER(WHERE s.status='unpaid')::integer pending,max(s.updated_at) updated
    FROM customer_subscriptions s WHERE s.owner_id=u.id AND s.deleted_at IS NULL
  ) orders
  CROSS JOIN LATERAL (
    SELECT count(*)::integer total,count(*) FILTER(WHERE p.status<>'delivered')::integer active,
      count(*) FILTER(WHERE p.billing_status='paid')::integer paid,count(*) FILTER(WHERE p.billing_status='invoice_pending')::integer invoices,
      count(*) FILTER(WHERE p.status IN ('review','client_review'))::integer review,
      count(*) FILTER(WHERE p.status<>'delivered' AND p.deadline<CURRENT_DATE::text)::integer overdue,
      count(*) FILTER(WHERE p.status<>'delivered' AND NOT EXISTS (
        SELECT 1 FROM project_review_members m JOIN users editor ON editor.id=m.user_id
        WHERE m.project_id=p.id AND editor.active AND editor.deleted_at IS NULL AND editor.role='editor'
      ))::integer unassigned,
      min(p.deadline) FILTER(WHERE p.status<>'delivered') deadline,max(p.updated_at) updated
    FROM workspace_projects p WHERE p.owner_id=u.id
  ) projects
  CROSS JOIN LATERAL (
    SELECT count(*)::integer total FROM project_review_comments c
    JOIN project_review_versions v ON v.id=c.version_id JOIN workspace_projects p ON p.id=v.project_id
    WHERE p.owner_id=u.id AND NOT c.resolved AND c.category IN ('change','question') AND v.decision<>'approved'
  ) feedback
  WHERE u.role IN ('user','customer') AND u.deleted_at IS NULL
    ${selectedId ? sql`AND u.id=${selectedId}::uuid` : sql``}
`;

export async function loadClientDirectory(
  db: DatabaseClient,
  filters: ClientFilters,
): Promise<ClientDirectory> {
  const pattern = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
  const order =
    filters.sort === "name"
      ? sql`lower(COALESCE(name,email)),id`
      : filters.sort === "recent"
        ? sql`"lastActivity" DESC,id`
        : sql`("overdueProjects">0) DESC,("needsEditor">0) DESC,(NOT "managerActive") DESC,("pendingOrders">0 OR "pendingInvoices">0) DESC,"lastActivity" DESC,id`;
  const rows = reviewRows<ClientDirectory>(
    await db.execute(sql`
    WITH clients AS (${clientRollup()}), filtered AS (
      SELECT * FROM clients WHERE
        (${filters.q}='' OR name ILIKE ${pattern} OR email ILIKE ${pattern} OR country ILIKE ${pattern})
        AND (${filters.payment}='all' OR (${filters.payment}='paid' AND ("paidOrders">0 OR "paidProjects">0))
          OR (${filters.payment}='unpaid' AND "paidOrders"=0 AND "paidProjects"=0) OR (${filters.payment}='pending' AND ("pendingOrders">0 OR "pendingInvoices">0))
          OR (${filters.payment}='no-orders' AND "orderCount"=0 AND "projectCount"=0))
        AND (${filters.attention}='all' OR (${filters.attention}='needs-manager' AND ("paidOrders">0 OR "paidProjects">0) AND NOT "managerActive")
          OR (${filters.attention}='needs-editor' AND "needsEditor">0) OR (${filters.attention}='overdue' AND "overdueProjects">0)
          OR (${filters.attention}='review' AND "reviewProjects">0))
        AND (${filters.manager}='all' OR (${filters.manager}='unassigned' AND NOT "managerActive")
          OR "managerId"::text=${filters.manager})
    ), pagination AS (
      SELECT count(*)::integer total,greatest(1,ceil(count(*)::numeric/${CLIENT_PAGE_SIZE}))::integer AS "pageCount",
        least(${filters.page},greatest(1,ceil(count(*)::numeric/${CLIENT_PAGE_SIZE})))::integer page FROM filtered
    )
    SELECT pagination.*,
      (SELECT jsonb_build_object('total',count(*),'paid',count(*) FILTER(WHERE "paidOrders">0 OR "paidProjects">0),
        'unpaid',count(*) FILTER(WHERE "paidOrders"=0 AND "paidProjects"=0),'pending',count(*) FILTER(WHERE "pendingOrders">0 OR "pendingInvoices">0),
        'needsManager',count(*) FILTER(WHERE ("paidOrders">0 OR "paidProjects">0) AND NOT "managerActive"),'needsEditor',count(*) FILTER(WHERE "needsEditor">0),
        'overdue',count(*) FILTER(WHERE "overdueProjects">0),'review',count(*) FILTER(WHERE "reviewProjects">0)) FROM clients) summary,
      COALESCE((SELECT jsonb_agg(row) FROM (SELECT * FROM filtered ORDER BY ${order}
        LIMIT ${CLIENT_PAGE_SIZE} OFFSET ((SELECT page FROM pagination)-1)*${CLIENT_PAGE_SIZE}) row),'[]'::jsonb) clients
    FROM pagination
  `),
  );
  return rows[0];
}

const clientEvents = (clientId: string) => sql`
  WITH client AS (SELECT * FROM users WHERE id=${clientId}::uuid AND role IN ('user','customer') AND deleted_at IS NULL),
  projects AS (SELECT p.* FROM workspace_projects p JOIN client c ON c.id=p.owner_id),
  events AS (
    SELECT c.id::text||':account' id,'account' kind,'Client account created' title,COALESCE(c.name,c.email) detail,c.created_at at,c.id "entityId",NULL::uuid "projectId" FROM client c
    UNION ALL SELECT a.client_id::text||':manager','assignment',CASE WHEN a.assigned_by IS NULL THEN 'Existing manager assignment recorded' WHEN a.manager_id IS NULL THEN 'Manager removed' ELSE 'Manager assigned' END,COALESCE(m.name,CASE WHEN a.manager_id IS NULL THEN 'No manager assigned' ELSE 'Assigned manager' END),a.assigned_at,a.client_id,NULL::uuid FROM client_project_managers a JOIN client c ON c.id=a.client_id LEFT JOIN users m ON m.id=a.manager_id
    UNION ALL SELECT p.id::text||':project','project','Project created',p.title,p.created_at,p.id,p.id FROM projects p
    UNION ALL SELECT p.id::text||':status','project',CASE p.status WHEN 'delivered' THEN 'Project delivered' WHEN 'revision' THEN 'Revision requested' WHEN 'review' THEN 'Ready for review' WHEN 'client_review' THEN 'Ready for review' ELSE 'Project updated' END,p.title,p.updated_at,p.id,p.id FROM projects p WHERE p.updated_at>p.created_at+interval '1 second'
    UNION ALL SELECT s.id::text||':order','order','Order placed',s.plan_name,s.created_at,s.id,NULL::uuid FROM customer_subscriptions s JOIN client c ON c.id=s.owner_id WHERE s.deleted_at IS NULL
    UNION ALL SELECT s.id::text||':payment','payment','Payment confirmed',s.plan_name,s.paid_at,s.id,NULL::uuid FROM customer_subscriptions s JOIN client c ON c.id=s.owner_id WHERE s.status='paid' AND s.deleted_at IS NULL
    UNION ALL SELECT v.id::text||':cut','review','Review cut uploaded',p.title||' / '||v.title,v.created_at,v.id,p.id FROM project_review_versions v JOIN projects p ON p.id=v.project_id
    UNION ALL SELECT v.id::text||':decision','review',CASE WHEN v.decision='approved' THEN 'Video approved' ELSE 'Changes requested' END,p.title,v.updated_at,v.id,p.id FROM project_review_versions v JOIN projects p ON p.id=v.project_id WHERE v.decision<>'pending'
    UNION ALL SELECT r.id::text||':legacy-review','review',CASE WHEN r.decision='approved' THEN 'Project approved' ELSE 'Revision requested' END,p.title,r.created_at,r.id,p.id FROM workspace_project_reviews r JOIN projects p ON p.id=r.project_id
    UNION ALL SELECT f.id::text||':feedback','review',CASE WHEN f.parent_id IS NULL THEN 'New feedback' ELSE 'Feedback reply' END,p.title||' / '||f.author_name,f.created_at,f.id,p.id FROM project_review_comments f JOIN project_review_versions v ON v.id=f.version_id JOIN projects p ON p.id=v.project_id
    UNION ALL SELECT m.id::text||':editor','assignment','Editor assigned',p.title||' / '||COALESCE(editor.name,'Editor'),m.created_at,m.id,p.id FROM project_review_members m JOIN projects p ON p.id=m.project_id JOIN users editor ON editor.id=m.user_id WHERE editor.role='editor'
    UNION ALL SELECT f.id::text||':file','file','Source link shared',p.title||' / '||f.file_name,f.created_at,f.id,p.id FROM workspace_project_files f JOIN projects p ON p.id=f.project_id WHERE f.kind<>'review'
    UNION ALL SELECT q.id::text||':quote','quote','Custom quote requested',q.title,q.created_at,q.id,NULL::uuid FROM custom_quotes q JOIN client c ON c.id=q.owner_id
    UNION ALL SELECT q.id::text||':quote-status','quote',CASE q.status WHEN 'closed' THEN 'Custom quote closed' WHEN 'contacted' THEN 'Quote follow-up recorded' ELSE 'Custom quote updated' END,q.title,q.updated_at,q.id,NULL::uuid FROM custom_quotes q JOIN client c ON c.id=q.owner_id WHERE q.updated_at>q.created_at+interval '1 second'
    UNION ALL SELECT e.id::text||':enquiry','enquiry','Enquiry received',COALESCE(e.project_type,'General enquiry'),e.created_at,e.id,NULL::uuid FROM contact_messages e JOIN client c ON lower(c.email)=lower(e.email)
    UNION ALL SELECT e.id::text||':enquiry-reply','enquiry','Enquiry replied to',COALESCE(e.project_type,'General enquiry'),e.replied_at,e.id,NULL::uuid FROM contact_messages e JOIN client c ON lower(c.email)=lower(e.email) WHERE e.replied_at IS NOT NULL
  )
  SELECT events.*,CASE WHEN comment.version_id IS NOT NULL THEN comment.version_id WHEN events.kind='review' AND (events.id LIKE '%:cut' OR events.id LIKE '%:decision') THEN events."entityId" ELSE NULL END AS "versionId"
  FROM events LEFT JOIN project_review_comments comment ON events.kind='review' AND comment.id=events."entityId" WHERE at IS NOT NULL
`;

export async function loadClientDetail(
  db: DatabaseClient,
  clientId: string,
  params: URLSearchParams,
): Promise<ClientDetail | null> {
  if (!isWorkspaceRecordId(clientId))
    throw new Response("Client not found.", { status: 404 });
  const client = reviewRows<ClientDetail["client"]>(
    await db.execute(clientRollup(clientId)),
  )[0];
  if (!client) return null;
  const clamp = (key: string, total: number, size: number) =>
    Math.min(
      getPositivePage(params.get(key)),
      Math.max(1, Math.ceil(total / size)),
    );
  const projectPage = clamp(
    "projectPage",
    client.projectCount,
    CLIENT_DETAIL_PAGE_SIZE,
  );
  const orderPage = clamp(
    "orderPage",
    client.orderCount,
    CLIENT_DETAIL_PAGE_SIZE,
  );
  const [projects, orders, paidTotals, activity] = await Promise.all([
    db.execute(sql`SELECT p.id,p.title,p.status,p.deadline,p.billing_status AS "billingStatus",p.review_revision AS "reviewRevision",p.updated_at AS "updatedAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'name',COALESCE(e.name,'Editor'),'active',e.active AND e.deleted_at IS NULL) ORDER BY e.name,e.id)
        FROM project_review_members m JOIN users e ON e.id=m.user_id WHERE m.project_id=p.id AND e.role='editor'),'[]'::jsonb) editors,
      (SELECT count(*)::integer FROM project_review_comments f JOIN project_review_versions v ON v.id=f.version_id
        WHERE v.project_id=p.id AND NOT f.resolved AND f.category IN ('change','question') AND v.decision<>'approved') AS "unresolvedFeedback"
      FROM workspace_projects p WHERE p.owner_id=${clientId}::uuid ORDER BY (p.status='delivered'),p.deadline NULLS LAST,p.updated_at DESC,p.id
      LIMIT ${CLIENT_DETAIL_PAGE_SIZE} OFFSET ${(projectPage - 1) * CLIENT_DETAIL_PAGE_SIZE}`),
    db.execute(sql`SELECT s.id,s.plan_name AS "planName",s.status,s.amount_cents AS "amountCents",s.currency,s.purchase_type AS "purchaseType",s.created_at AS "createdAt",s.paid_at AS "paidAt"
      FROM customer_subscriptions s WHERE s.owner_id=${clientId}::uuid AND s.deleted_at IS NULL ORDER BY (s.status='paid'),s.created_at DESC,s.id
      LIMIT ${CLIENT_DETAIL_PAGE_SIZE} OFFSET ${(orderPage - 1) * CLIENT_DETAIL_PAGE_SIZE}`),
    db.execute(sql`SELECT currency,sum(amount_cents)::double precision AS "amountCents" FROM customer_subscriptions
      WHERE owner_id=${clientId}::uuid AND status='paid' AND deleted_at IS NULL GROUP BY currency ORDER BY currency`),
    db.execute(sql`WITH events AS (${clientEvents(clientId)}), pagination AS (
      SELECT count(*)::integer total,least(${Math.min(getPositivePage(params.get("eventPage")), 100_000)},greatest(1,ceil(count(*)::numeric/${CLIENT_EVENT_PAGE_SIZE})))::integer page FROM events
    ) SELECT pagination.*,COALESCE((SELECT jsonb_agg(row) FROM (SELECT * FROM events ORDER BY at DESC,id DESC
      LIMIT ${CLIENT_EVENT_PAGE_SIZE} OFFSET ((SELECT page FROM pagination)-1)*${CLIENT_EVENT_PAGE_SIZE}) row),'[]'::jsonb) events FROM pagination`),
  ]);
  const timeline = reviewRows<{
    total: number;
    page: number;
    events: ClientDetail["events"];
  }>(activity)[0];
  // Serialize SQL timestamps consistently for React Router and browser rendering.
  return JSON.parse(
    JSON.stringify({
      client,
      projects: reviewRows(projects),
      orders: reviewRows(orders),
      paidTotals: reviewRows(paidTotals),
      events: timeline.events,
      eventCount: timeline.total,
      eventPage: timeline.page,
      projectPage,
      orderPage,
    }),
  ) as ClientDetail;
}

export async function loadClientManagers(db: DatabaseClient) {
  return reviewRows<{
    id: string;
    name: string;
    email: string;
    clients: number;
  }>(
    await db.execute(sql`
    SELECT u.id,COALESCE(u.name,u.email) name,u.email,(SELECT count(*)::integer FROM client_project_managers a
      JOIN users c ON c.id=a.client_id WHERE a.manager_id=u.id AND c.deleted_at IS NULL AND c.role IN ('user','customer')) clients
    FROM users u WHERE u.role='project_manager' AND u.active AND u.deleted_at IS NULL ORDER BY name,u.id
  `),
  );
}
