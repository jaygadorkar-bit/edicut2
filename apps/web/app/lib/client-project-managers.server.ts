import type { DatabaseClient } from "@edicut/db/client";
import { sql } from "drizzle-orm";
import { chatRows } from "./chat.server";
import type { ChatActor } from "./chat";

export type LegacyClientManagerAssignment = {
  clientId: string;
  managerId: string;
};

/** Seed only missing canonical assignments from the existing chat assignment store. */
export async function importMissingClientProjectManagers(
  db: DatabaseClient,
  actor: ChatActor,
  assignments: LegacyClientManagerAssignment[],
) {
  if (!actor.admin && actor.role !== "project_manager")
    throw new Response("Manager assignment access required.", { status: 403 });
  const validAssignments = assignments.filter(
    (assignment) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignment.clientId) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assignment.managerId) &&
      (actor.admin || assignment.managerId === actor.id),
  );
  if (!validAssignments.length) return;

  await db.execute(sql`INSERT INTO client_project_managers (client_id, manager_id, assigned_by, assigned_at)
    SELECT source.client_id::uuid, source.manager_id::uuid, NULL, clock_timestamp()
    FROM jsonb_to_recordset(${JSON.stringify(validAssignments.map(item => ({ client_id: item.clientId, manager_id: item.managerId })))}::jsonb) AS source(client_id text, manager_id text)
    JOIN users client ON client.id = source.client_id::uuid AND client.active AND client.deleted_at IS NULL
      AND client.role IN ('user', 'customer')
    JOIN users manager ON manager.id = source.manager_id::uuid AND manager.active
      AND manager.deleted_at IS NULL AND manager.role = 'project_manager'
    WHERE EXISTS (SELECT 1 FROM customer_subscriptions purchase WHERE purchase.owner_id = client.id AND purchase.status='paid' AND purchase.deleted_at IS NULL)
    ON CONFLICT (client_id) DO NOTHING`);
}

/** Change the authoritative client assignment. The expected value prevents stale admin forms overwriting another assignment. */
export async function assignClientProjectManager(
  db: DatabaseClient,
  actor: ChatActor,
  clientId: string,
  managerId: string | null,
  expectedManagerId: string | null,
) {
  if (!actor.admin) throw new Response("Administrator access required.", { status: 403 });
  const rows = chatRows<{ clientId: string }>(await db.execute(sql`WITH allowed AS MATERIALIZED (
    SELECT client.id FROM users client
    WHERE client.id=${clientId}::uuid AND client.deleted_at IS NULL
      AND client.role IN ('user', 'customer')
      AND (${managerId}::uuid IS NULL OR client.active)
      AND EXISTS (SELECT 1 FROM admin_users admin WHERE admin.id=${actor.id}::uuid AND admin.active AND admin.role='admin')
      AND (${managerId}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM users manager WHERE manager.id=${managerId}::uuid AND manager.active AND manager.deleted_at IS NULL AND manager.role='project_manager'
      ))
      AND (${expectedManagerId}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM client_project_managers current_assignment WHERE current_assignment.client_id=client.id
          AND (current_assignment.manager_id IS NOT DISTINCT FROM ${expectedManagerId}::uuid
            OR current_assignment.manager_id IS NOT DISTINCT FROM ${managerId}::uuid)
      ))
  )
  INSERT INTO client_project_managers (client_id, manager_id, assigned_by, assigned_at)
  SELECT allowed.id, ${managerId}::uuid, ${actor.id}::uuid, clock_timestamp() FROM allowed
  ON CONFLICT (client_id) DO UPDATE SET
    manager_id=EXCLUDED.manager_id,
    assigned_by=EXCLUDED.assigned_by,
    assigned_at=clock_timestamp()
  WHERE client_project_managers.manager_id IS NOT DISTINCT FROM ${expectedManagerId}::uuid
    OR client_project_managers.manager_id IS NOT DISTINCT FROM ${managerId}::uuid
  RETURNING client_id AS "clientId"`));
  if (!rows.length)
    throw new Response("The client assignment changed or the selected account is unavailable. Refresh and try again.", { status: 409 });
}
