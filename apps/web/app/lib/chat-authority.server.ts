import type { DatabaseClient } from "@edicut/db/client";
import { sql } from "drizzle-orm";
import { chatRows } from "./chat.server";
import { chatIsStaff, type ChatActor } from "./chat";

export type ChatIdentity = { id: string; email: string; name: string | null; role: string; active: boolean; deletedAt: string | null; paid: boolean; avatarUrl?: string | null };
export type ChatAuthority = { users: ChatIdentity[]; admins: Omit<ChatIdentity, "deletedAt" | "paid">[] };

/** Phase one deliberately reads current permissions from Neon. D1 identity
 * copies are FK/display records, never a cached authorization authority. */
export async function loadChatAuthority(db: DatabaseClient, actor?: ChatActor): Promise<ChatAuthority> {
  // Customers need their own current permissions and the staff in their rooms.
  // Staff operations and recipient fan-out still require the full directory.
  const users = actor && !chatIsStaff(actor)
    ? sql`u.id = ${actor.id}::uuid OR u.role IN ('project_manager', 'customer_support')`
    : sql`true`;
  const result = chatRows<{ authority: ChatAuthority }>(await db.execute(sql`SELECT jsonb_build_object(
    'users', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'name', u.name,
      'avatarUrl', CASE WHEN left(u.profile_image_url, 8) = 'https://' AND length(u.profile_image_url) <= 2048 THEN u.profile_image_url ELSE NULL END,
      'role', u.role, 'active', u.active, 'deletedAt', u.deleted_at,
      'paid', EXISTS (SELECT 1 FROM customer_subscriptions s WHERE s.owner_id = u.id AND s.status = 'paid' AND s.deleted_at IS NULL))) FROM users u WHERE ${users}), '[]'::jsonb),
    'admins', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'email', a.email, 'name', a.name, 'role', a.role, 'active', a.active,
      'avatarUrl', (SELECT CASE WHEN left(p.profile_image_url, 8) = 'https://' AND length(p.profile_image_url) <= 2048 THEN p.profile_image_url ELSE NULL END
        FROM users p WHERE lower(p.email) = lower(a.email) AND p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT 1))) FROM admin_users a), '[]'::jsonb)
  ) AS authority`))[0];
  if (!result?.authority || !Array.isArray(result.authority.users) || !Array.isArray(result.authority.admins)) throw new Error("Chat authorization unavailable");
  return result.authority;
}
