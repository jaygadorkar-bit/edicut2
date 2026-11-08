import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import type { ReviewActor, ReviewProject } from "./project-review";
import { projectReviewAccessSql, reviewRows } from "./project-review.server";

export type ManagerClientProject = Pick<ReviewProject, "id" | "title" | "status" | "deadline" | "updatedAt">;

export type ManagerClient = {
  id: string;
  name: string;
  email: string;
  projectCount: number;
  activeProjectCount: number;
  reviewCount: number;
  lastActivity: string | Date | null;
  assignedAt: string | Date;
  recentProjects: ManagerClientProject[];
};

export type ManagerActionProject = ReviewProject & {
  clientName: string;
  nextAction: string;
};

function requireManager(actor: ReviewActor) {
  if (actor.admin || actor.role !== "project_manager") {
    throw new Response("Project manager access required.", { status: 403 });
  }
}

/** The client directory is limited to active clients currently assigned to this manager. */
export async function loadManagerClientDirectory(
  db: DatabaseClient,
  actor: ReviewActor,
  reviewsEnabled = true,
): Promise<ManagerClient[]> {
  requireManager(actor);
  const access = projectReviewAccessSql(actor);
  const clients = reviewRows<Omit<ManagerClient, "recentProjects">>(await db.execute(sql`
    SELECT
      client.id,
      COALESCE(NULLIF(BTRIM(client.name), ''), client.email) AS name,
      client.email,
      count(p.id)::integer AS "projectCount",
      count(p.id) FILTER (WHERE p.status <> 'delivered')::integer AS "activeProjectCount",
      count(p.id) FILTER (WHERE ${reviewsEnabled} AND p.status IN ('review', 'client_review'))::integer AS "reviewCount",
      max(p.updated_at) AS "lastActivity",
      assignment.assigned_at AS "assignedAt"
    FROM client_project_managers assignment
    JOIN users manager ON manager.id=assignment.manager_id
      AND manager.active AND manager.deleted_at IS NULL AND manager.role='project_manager'
    JOIN users client ON client.id=assignment.client_id
      AND client.active AND client.deleted_at IS NULL AND client.role IN ('user','customer')
    LEFT JOIN workspace_projects p ON p.owner_id=client.id AND ${access}
    WHERE assignment.manager_id=${actor.id}::uuid
    GROUP BY client.id, assignment.assigned_at
    ORDER BY max(p.updated_at) DESC NULLS LAST, name, client.id
  `));

  const recentProjects = reviewRows<ManagerClientProject & { clientId: string }>(await db.execute(sql`
    SELECT id,"clientId",title,status,deadline,"updatedAt" FROM (
      SELECT
        p.id,
        p.owner_id AS "clientId",
        p.title,
        p.status,
        p.deadline,
        p.updated_at AS "updatedAt",
        row_number() OVER (PARTITION BY p.owner_id ORDER BY p.updated_at DESC,p.id) AS project_rank
      FROM workspace_projects p
      WHERE ${access}
    ) recent
    WHERE project_rank <= 3
    ORDER BY "clientId", "updatedAt" DESC
  `));
  const recentByClient = new Map<string, ManagerClientProject[]>();
  for (const project of recentProjects) {
    const projects = recentByClient.get(project.clientId) ?? [];
    projects.push({
      id: project.id,
      title: project.title,
      status: project.status,
      deadline: project.deadline,
      updatedAt: project.updatedAt,
    });
    recentByClient.set(project.clientId, projects);
  }

  return clients.map((client) => ({
    ...client,
    projectCount: Number(client.projectCount) || 0,
    activeProjectCount: Number(client.activeProjectCount) || 0,
    reviewCount: Number(client.reviewCount) || 0,
    recentProjects: recentByClient.get(client.id) ?? [],
  }));
}

/** Prioritized manager work, scoped to projects owned by currently assigned clients. */
export async function loadManagerActionQueue(
  db: DatabaseClient,
  actor: ReviewActor,
  limit = 8,
): Promise<ManagerActionProject[]> {
  requireManager(actor);
  const access = projectReviewAccessSql(actor);
  return reviewRows<ManagerActionProject>(await db.execute(sql`
    SELECT
      p.id,
      p.owner_id AS "ownerId",
      p.title,
      p.channel_name AS "channelName",
      p.status,
      p.deadline,
      p.notes,
      p.updated_at AS "updatedAt",
      COALESCE(NULLIF(BTRIM(client.name), ''), client.email) AS "clientName",
      CASE
        WHEN p.deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND p.deadline=to_char(to_date(p.deadline,'YYYY-MM-DD'),'YYYY-MM-DD')
          AND p.deadline < CURRENT_DATE::text THEN 'Past target date'
        WHEN NOT EXISTS (
          SELECT 1 FROM project_review_members membership
          JOIN users editor ON editor.id=membership.user_id
          WHERE membership.project_id=p.id AND editor.active
            AND editor.deleted_at IS NULL AND editor.role='editor'
        ) THEN 'Assign an editor'
        WHEN p.status IN ('review','client_review') THEN 'Follow up on client review'
        WHEN p.status='revision' THEN 'Follow up on revision'
        WHEN p.deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND p.deadline=to_char(to_date(p.deadline,'YYYY-MM-DD'),'YYYY-MM-DD')
          AND p.deadline BETWEEN CURRENT_DATE::text AND (CURRENT_DATE + 7)::text THEN 'Delivery due soon'
        ELSE 'Check project progress'
      END AS "nextAction"
    FROM workspace_projects p
    JOIN users client ON client.id=p.owner_id AND client.active
      AND client.deleted_at IS NULL AND client.role IN ('user','customer')
    WHERE ${access} AND p.status <> 'delivered'
    ORDER BY
      CASE
        WHEN p.deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND p.deadline=to_char(to_date(p.deadline,'YYYY-MM-DD'),'YYYY-MM-DD')
          AND p.deadline < CURRENT_DATE::text THEN 0
        WHEN NOT EXISTS (
          SELECT 1 FROM project_review_members membership
          JOIN users editor ON editor.id=membership.user_id
          WHERE membership.project_id=p.id AND editor.active
            AND editor.deleted_at IS NULL AND editor.role='editor'
        ) THEN 1
        WHEN p.status IN ('review','client_review') THEN 2
        WHEN p.status='revision' THEN 3
        WHEN p.deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND p.deadline=to_char(to_date(p.deadline,'YYYY-MM-DD'),'YYYY-MM-DD')
          AND p.deadline BETWEEN CURRENT_DATE::text AND (CURRENT_DATE + 7)::text THEN 4
        ELSE 5
      END,
      p.deadline NULLS LAST,
      p.updated_at ASC,
      p.id
    LIMIT ${Math.max(1, Math.min(50, Math.trunc(limit) || 8))}
  `));
}
