import type { DatabaseClient } from "@edicut/db/client";
import { sql, type SQL } from "drizzle-orm";
import { CHAT_HISTORY_SIZE, CHAT_PAGE_SIZE, chatIsStaff, chatMessagePayloadMatches, chatSenderName, sanitizeChatMessageBody, type ChatActor, type ChatAttachment, type ChatMessage, type ChatPerson, type ChatReceipt, type ChatRoom, type ChatView, type TicketCategory, type TicketPriority, type TicketStatus } from "./chat";

export function chatRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows?: T[] })?.rows ?? []) as T[];
}
export function isMissingChatSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; cause?: unknown };
  return (e.code === "42P01" && /chat_(rooms|messages|reads)|support_tickets/.test(e.message ?? "")) || Boolean(e.cause && isMissingChatSchema(e.cause));
}
const paidClientSql = (client: SQL = sql`r.client_id`) => sql`EXISTS (SELECT 1 FROM customer_subscriptions purchase WHERE purchase.owner_id = ${client} AND purchase.status = 'paid' AND purchase.deleted_at IS NULL)`;
// Always check the current database role, including inside writes. A stale session
// or a concurrent reassignment must never give a former manager access.
export function chatAccessSql(actor: ChatActor): SQL {
  const eligible = sql`((r.kind = 'manager' AND ${paidClientSql()}) OR (r.kind = 'support' AND EXISTS (SELECT 1 FROM support_tickets ticket WHERE ticket.room_id = r.id)))`;
  if (actor.admin) return sql`${eligible} AND EXISTS (SELECT 1 FROM admin_users a WHERE a.id = ${actor.id}::uuid AND a.active AND a.role = 'admin')`;
  const access = actor.role === "project_manager"
    ? sql`${eligible} AND r.kind = 'manager' AND r.manager_id = ${actor.id}::uuid AND m.active AND m.deleted_at IS NULL AND m.role = 'project_manager'`
    : actor.role === "customer_support" ? sql`${eligible} AND r.kind = 'support'` : sql`r.client_id = ${actor.id}::uuid AND (r.kind = 'manager' OR EXISTS (SELECT 1 FROM support_tickets ticket WHERE ticket.room_id = r.id))`;
  return sql`c.active AND c.deleted_at IS NULL AND (${access}) AND EXISTS
    (SELECT 1 FROM users viewer WHERE viewer.id = ${actor.id}::uuid AND viewer.active AND viewer.deleted_at IS NULL AND viewer.role = ${actor.role})`;
}
const contentAccessSql = (actor: ChatActor) => sql`(${chatAccessSql(actor)}) AND (r.kind = 'support' OR ${paidClientSql()})`;
const unreadMessageSql = (actor: ChatActor) => sql`msg.deleted_at IS NULL AND msg.actor_key <> ${actor.key} AND
  (rd.last_read_at IS NULL OR (msg.created_at, msg.id) > (rd.last_read_at, COALESCE(rd.last_read_id, '00000000-0000-0000-0000-000000000000'::uuid)))`;
const writableSql = sql`(r.kind = 'manager' AND ${paidClientSql()} OR r.kind = 'support' AND EXISTS (SELECT 1 FROM support_tickets ticket WHERE ticket.room_id = r.id AND ticket.status <> 'closed'))`;
const roomColumns = (actor: ChatActor) => sql`r.id, r.client_id AS "clientId", COALESCE(c.name, ${actor.admin ? sql`c.email` : sql`'Client'`}) AS "clientName", CASE WHEN ${actor.admin} THEN c.email ELSE NULL END AS "clientEmail",
  (c.active AND c.deleted_at IS NULL) AS "clientActive", r.kind, r.manager_id AS "managerId", m.name AS "managerName",
  COALESCE(m.active AND m.deleted_at IS NULL AND m.role = 'project_manager', false) AS "managerActive",
  r.last_message_at AS "lastMessageAt", CASE WHEN r.kind = 'support' OR ${paidClientSql()} THEN r.last_message_preview ELSE NULL END AS "lastMessagePreview", r.updated_at AS "updatedAt", ${paidClientSql()} AS "projectUnlocked",
  CASE WHEN r.kind = 'support' OR ${paidClientSql()} THEN (SELECT latest.actor_key FROM chat_messages latest WHERE latest.room_id=r.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) ELSE NULL END AS "lastMessageActorKey",
  CASE WHEN r.kind = 'support' OR ${paidClientSql()} THEN EXISTS (
    SELECT 1 FROM chat_messages latest JOIN chat_reads receipt ON receipt.room_id=latest.room_id
    WHERE latest.id=(SELECT newest.id FROM chat_messages newest WHERE newest.room_id=r.id ORDER BY newest.created_at DESC,newest.id DESC LIMIT 1)
      AND receipt.actor_key<>latest.actor_key
      AND (receipt.last_read_at,COALESCE(receipt.last_read_id,'00000000-0000-0000-0000-000000000000'::uuid)) >= (latest.created_at,latest.id)
      AND (receipt.actor_key='user:'||r.client_id
        OR receipt.actor_key IN (SELECT 'admin:'||reader.id FROM admin_users reader WHERE reader.active AND reader.role='admin')
        OR (r.manager_id IS NOT NULL AND receipt.actor_key='user:'||r.manager_id AND m.active AND m.deleted_at IS NULL AND m.role='project_manager'))
  ) ELSE false END AS "lastMessageRead",
  CASE WHEN r.kind = 'manager' AND ${paidClientSql()} THEN (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', member.actor_key, 'name', member.name, 'role', member.role,
      'avatarUrl', member.avatar_url, 'lastActiveAt', CASE WHEN member.actor_key = 'admin:team' THEN (
        SELECT max(team_activity.active_at) FROM (
          SELECT rd.last_read_at AS active_at FROM chat_reads rd WHERE rd.room_id=r.id AND rd.actor_key IN
            (SELECT 'admin:' || team_member.id FROM admin_users team_member WHERE team_member.active AND team_member.role='admin')
          UNION ALL SELECT msg.created_at FROM chat_messages msg WHERE msg.room_id=r.id AND msg.actor_key IN
            (SELECT 'admin:' || team_member.id FROM admin_users team_member WHERE team_member.active AND team_member.role='admin')
        ) team_activity
      ) ELSE (SELECT max(activity.active_at) FROM (
        SELECT rd.last_read_at AS active_at FROM chat_reads rd WHERE rd.room_id=r.id AND rd.actor_key=member.actor_key
        UNION ALL SELECT msg.created_at FROM chat_messages msg WHERE msg.room_id=r.id AND msg.actor_key=member.actor_key
      ) activity) END) ORDER BY member.role, member.name), '[]'::jsonb)
    FROM (
      SELECT 'admin:team' AS actor_key, 'EdiCut Admin' AS name, 'admin' AS role, NULL::text AS avatar_url
      WHERE EXISTS (SELECT 1 FROM admin_users participant WHERE participant.active AND participant.role='admin')
      UNION ALL SELECT 'user:' || manager.id, COALESCE(manager.name, ${actor.admin ? sql`manager.email` : sql`'Project manager'`}), 'project_manager',
        CASE WHEN left(manager.profile_image_url, 8)='https://' AND length(manager.profile_image_url)<=2048 THEN manager.profile_image_url ELSE NULL END
      FROM users manager WHERE manager.id=r.manager_id AND manager.active AND manager.deleted_at IS NULL AND manager.role='project_manager'
      ${chatIsStaff(actor) ? sql`UNION ALL SELECT 'user:' || client.id, COALESCE(client.name, ${actor.admin ? sql`client.email` : sql`'Client'`}), client.role,
        CASE WHEN left(client.profile_image_url, 8)='https://' AND length(client.profile_image_url)<=2048 THEN client.profile_image_url ELSE NULL END
        FROM users client WHERE client.id=r.client_id AND client.active AND client.deleted_at IS NULL` : sql``}
    ) member WHERE member.actor_key <> ${actor.key}
  ) ELSE '[]'::jsonb END AS participants,
  CASE WHEN t.room_id IS NULL THEN NULL ELSE jsonb_build_object('number', t.ticket_number, 'subject', t.subject, 'category', t.category, 'priority', t.priority, 'status', t.status, 'closedAt', t.closed_at, 'updatedAt', t.updated_at) END AS ticket,
  (SELECT count(*)::int FROM chat_messages msg LEFT JOIN chat_reads rd ON rd.room_id = r.id AND rd.actor_key = ${actor.key}
   WHERE msg.room_id = r.id AND (r.kind = 'support' OR ${paidClientSql()}) AND (${unreadMessageSql(actor)})) AS "unreadCount"`;
const messageColumns = sql`id, room_id AS "roomId", actor_key AS "actorKey", sender_name AS "senderName", sender_role AS "senderRole", body, attachment, edited_at AS "editedAt", deleted_at AS "deletedAt", client_nonce AS "clientNonce", created_at AS "createdAt"`;
function serializeRoom(room: ChatRoom, actor: ChatActor): ChatRoom {
  return { ...room, clientName: actor.admin ? room.clientName : chatSenderName("customer", room.clientName),
    managerName: room.managerName ? chatSenderName("project_manager", room.managerName) : null,
    participants: room.participants?.map(participant => ({ ...participant, name: chatSenderName(participant.role, participant.name) })),
    updatedAt: new Date(room.updatedAt).toISOString(), lastMessageAt: room.lastMessageAt ? new Date(room.lastMessageAt).toISOString() : null, unreadCount: Number(room.unreadCount), ticket: room.ticket ? { ...room.ticket, updatedAt: new Date(room.ticket.updatedAt).toISOString(), closedAt: room.ticket.closedAt ? new Date(room.ticket.closedAt).toISOString() : null } : null };
}
const serializeMessage = (m: ChatMessage): ChatMessage => ({ ...m, senderName: chatSenderName(m.senderRole, m.senderName), body: sanitizeChatMessageBody(m.actorKey, m.body), createdAt: new Date(m.createdAt).toISOString(), editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null, deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : null });

export async function ensureClientChatRooms(db: DatabaseClient, actor: ChatActor) {
  if (actor.role === 'customer_support') return;
  if (actor.admin || !chatIsStaff(actor)) await db.execute(sql`INSERT INTO chat_rooms (client_id, kind)
    SELECT u.id, 'manager' FROM users u WHERE u.active AND u.deleted_at IS NULL AND u.role NOT IN ('project_manager', 'customer_support')
    AND (${actor.admin ? sql`${paidClientSql(sql`u.id`)} AND EXISTS (SELECT 1 FROM admin_users a WHERE a.id = ${actor.id}::uuid AND a.active AND a.role = 'admin')` : sql`u.id = ${actor.id}::uuid AND u.role = ${actor.role}`})
    ON CONFLICT (client_id) WHERE kind = 'manager' DO NOTHING`);
  await db.execute(sql`WITH welcome AS (
    INSERT INTO chat_messages (room_id, actor_key, sender_name, sender_role, body, client_nonce)
    SELECT r.id, 'system:admin', 'EdiCut Admin', 'admin', 'A manager will be assigned to you shortly. You can message our admin team here while you wait.', r.id
    FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    WHERE r.kind = 'manager' AND ${paidClientSql()} AND (${chatAccessSql(actor)})
    ON CONFLICT (actor_key, client_nonce) DO NOTHING RETURNING room_id, created_at, body
  ) UPDATE chat_rooms r SET last_message_at = welcome.created_at, last_message_preview = left(welcome.body, 180), updated_at = welcome.created_at
    FROM welcome WHERE r.id = welcome.room_id AND (r.last_message_at IS NULL OR r.last_message_at <= welcome.created_at)`);
}
export async function listChatRooms(db: DatabaseClient, actor: ChatActor, page = 1, search = "", filter = "all", view: ChatView = "projects") {
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const rooms = chatRows<ChatRoom>(await db.execute(sql`SELECT ${roomColumns(actor)} FROM chat_rooms r
    JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id LEFT JOIN support_tickets t ON t.room_id = r.id
    WHERE (${chatAccessSql(actor)}) AND r.kind = ${view === 'tickets' ? 'support' : 'manager'}
    AND (${search} = '' OR c.name ILIKE ${pattern} OR c.email ILIKE ${pattern} OR r.last_message_preview ILIKE ${pattern} OR t.subject ILIKE ${pattern} OR t.ticket_number::text ILIKE ${pattern})
    AND (${view !== 'tickets' || filter === 'all'} OR (${filter} = 'open' AND t.status <> 'closed') OR t.status = ${filter})
    ORDER BY r.updated_at DESC, r.id DESC LIMIT ${CHAT_PAGE_SIZE + 1} OFFSET ${(page - 1) * CHAT_PAGE_SIZE}`));
  const counts = view === 'tickets' ? chatRows<{ status: TicketStatus; count: number }>(await db.execute(sql`SELECT t.status, count(*)::int AS count FROM support_tickets t JOIN chat_rooms r ON r.id = t.room_id JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE (${chatAccessSql(actor)}) GROUP BY t.status`)) : [];
  const ticketCounts = { all: 0, waiting_support: 0, waiting_customer: 0, closed: 0 }; for (const row of counts) { ticketCounts[row.status] = Number(row.count); ticketCounts.all += Number(row.count); }
  return { rooms: rooms.slice(0, CHAT_PAGE_SIZE).map(room => serializeRoom(room, actor)), hasMore: rooms.length > CHAT_PAGE_SIZE, page, ready: true, ...(view === 'tickets' ? { ticketCounts } : {}) };
}
export async function getChatRoom(db: DatabaseClient, actor: ChatActor, id: string) {
  const room = chatRows<ChatRoom>(await db.execute(sql`SELECT ${roomColumns(actor)} FROM chat_rooms r JOIN users c ON c.id = r.client_id
    LEFT JOIN users m ON m.id = r.manager_id LEFT JOIN support_tickets t ON t.room_id = r.id WHERE r.id = ${id}::uuid AND (${chatAccessSql(actor)})`))[0];
  if (!room) throw new Response("This conversation is unavailable.", { status: 404 });
  return serializeRoom(room, actor);
}
/** Count every authorized conversation, including those outside the current page or filter. */
export async function getChatUnreadCounts(db: DatabaseClient, actor: ChatActor) {
  const counts = chatRows<{ projects: number; tickets: number }>(await db.execute(sql`SELECT
    count(*) FILTER (WHERE r.kind = 'manager')::int AS projects,
    count(*) FILTER (WHERE r.kind = 'support')::int AS tickets
    FROM chat_messages msg JOIN chat_rooms r ON r.id = msg.room_id
    JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    LEFT JOIN chat_reads rd ON rd.room_id = r.id AND rd.actor_key = ${actor.key}
    WHERE (${contentAccessSql(actor)}) AND (${unreadMessageSql(actor)})`))[0];
  return { projects: Number(counts?.projects ?? 0), tickets: Number(counts?.tickets ?? 0) };
}
/** One authenticated browser request replaces independent rooms/history/badge refreshes. */
export async function getChatSnapshot(db: DatabaseClient, actor: ChatActor, options: {
  page: number; search: string; filter: string; view: ChatView; roomId?: string; messageSearch: string;
}) {
  const [state, unread, history] = await Promise.all([
    listChatRooms(db, actor, options.page, options.search, options.filter, options.view),
    getChatUnreadCounts(db, actor),
    options.roomId ? listChatMessages(db, actor, options.roomId, undefined, options.messageSearch).catch(error => {
      if (error instanceof Response && error.status === 404) return null;
      throw error;
    }) : null,
  ]);
  return { state, unread, history, historyUnavailable: Boolean(options.roomId && !history) };
}
export async function listChatMessages(db: DatabaseClient, actor: ChatActor, roomId: string, before?: { at: string; id: string }, search = "") {
  const room = await getChatRoom(db, actor, roomId);
  if (room.kind === 'manager' && !room.projectUnlocked) return { room, messages: [], hasOlder: false, receipts: [] };
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const messages = chatRows<ChatMessage>(await db.execute(sql`SELECT ${messageColumns} FROM chat_messages
    WHERE room_id = ${roomId}::uuid AND (${before ? sql`(created_at, id) < (${before.at}::timestamptz, ${before.id}::uuid)` : sql`true`})
    AND (${search} = '' OR (deleted_at IS NULL AND (body ILIKE ${pattern} OR attachment->>'name' ILIKE ${pattern})))
    AND EXISTS (SELECT 1 FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE r.id = ${roomId}::uuid AND (${contentAccessSql(actor)}))
    ORDER BY created_at DESC, id DESC LIMIT ${CHAT_HISTORY_SIZE + 1}`));
  const receipts = chatRows<ChatReceipt>(await db.execute(sql`SELECT rd.actor_key AS "actorKey", COALESCE(u.name, a.name, 'Team member') AS name,
    CASE WHEN a.id IS NOT NULL THEN 'admin' ELSE u.role END AS role, rd.last_read_at AS "lastReadAt", rd.last_read_id AS "lastReadId"
    FROM chat_reads rd LEFT JOIN users u ON rd.actor_key = 'user:' || u.id LEFT JOIN admin_users a ON rd.actor_key = 'admin:' || a.id
    WHERE rd.room_id = ${roomId}::uuid AND rd.actor_key <> ${actor.key}
    AND EXISTS (SELECT 1 FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE r.id = ${roomId}::uuid AND (${contentAccessSql(actor)})
      AND ((c.active AND c.deleted_at IS NULL AND rd.actor_key = 'user:' || r.client_id)
        OR (r.kind = 'manager' AND m.active AND m.deleted_at IS NULL AND m.role = 'project_manager' AND rd.actor_key = 'user:' || m.id)
        OR rd.actor_key IN (SELECT 'admin:' || reader.id FROM admin_users reader WHERE reader.active AND reader.role = 'admin')
        OR (r.kind = 'support' AND rd.actor_key IN (SELECT 'user:' || support.id FROM users support WHERE support.active AND support.deleted_at IS NULL AND support.role = 'customer_support'))))
    ORDER BY rd.last_read_at DESC LIMIT 100`)).map(r => ({ ...r, name: chatSenderName(r.role, r.name), lastReadAt: new Date(r.lastReadAt).toISOString() }));
  return { room, messages: messages.slice(0, CHAT_HISTORY_SIZE).map(serializeMessage).reverse(), hasOlder: messages.length > CHAT_HISTORY_SIZE, receipts };
}
export async function findChatMessageByNonce(db: DatabaseClient, actor: ChatActor, roomId: string, nonce: string) {
  await getChatRoom(db, actor, roomId);
  const row = chatRows<ChatMessage>(await db.execute(sql`SELECT ${messageColumns} FROM chat_messages WHERE actor_key = ${actor.key} AND client_nonce = ${nonce}::uuid`))[0];
  if (row && row.roomId !== roomId) throw new Response("Message reference already used.", { status: 409 });
  return row ? serializeMessage(row) : null;
}
export async function sendChatMessage(db: DatabaseClient, actor: ChatActor, roomId: string, body: string, nonce: string, attachment: ChatAttachment | null = null) {
  const saved = chatRows<ChatMessage>(await db.execute(sql`WITH allowed AS (
    SELECT r.id, r.kind FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    WHERE r.id = ${roomId}::uuid AND (${chatAccessSql(actor)}) AND c.active AND c.deleted_at IS NULL
    AND (${writableSql})
    FOR UPDATE OF r
  ), ticket_ready AS (
    UPDATE support_tickets t SET status = ${chatIsStaff(actor) ? 'waiting_customer' : 'waiting_support'}, updated_at = GREATEST(clock_timestamp(), t.updated_at + interval '1 millisecond')
    FROM allowed WHERE t.room_id = allowed.id AND t.status <> 'closed'
    AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE actor_key = ${actor.key} AND client_nonce = ${nonce}::uuid)
    RETURNING t.room_id
  ), inserted AS (
    INSERT INTO chat_messages (room_id, actor_key, sender_user_id, sender_admin_id, sender_name, sender_role, body, client_nonce, attachment)
    SELECT id, ${actor.key}, ${actor.admin ? null : actor.id}::uuid, ${actor.admin ? actor.id : null}::uuid, ${actor.name}, ${actor.role}, ${body}, ${nonce}::uuid, ${attachment ? JSON.stringify(attachment) : null}::jsonb FROM allowed
    WHERE allowed.kind = 'manager' OR EXISTS (SELECT 1 FROM ticket_ready WHERE room_id = allowed.id)
    ON CONFLICT (actor_key, client_nonce) DO NOTHING RETURNING *
  ), updated AS (
    UPDATE chat_rooms r SET last_message_at = greatest(COALESCE(r.last_message_at, '-infinity'::timestamptz), i.created_at),
      last_message_preview = CASE WHEN r.last_message_at IS NULL OR i.created_at >= r.last_message_at THEN left(COALESCE(NULLIF(i.body, ''), i.attachment->>'name'), 180) ELSE r.last_message_preview END,
      updated_at = greatest(r.updated_at, i.created_at) FROM inserted i WHERE r.id = i.room_id RETURNING r.id
  ) SELECT ${messageColumns} FROM inserted
    UNION ALL SELECT ${messageColumns} FROM chat_messages WHERE actor_key = ${actor.key} AND client_nonce = ${nonce}::uuid AND EXISTS (SELECT 1 FROM allowed)`))[0];
  // A concurrent identical request can observe the nonce conflict but not its row
  // in the same statement's snapshot. A fresh read resolves that safely.
  const message = saved ?? chatRows<ChatMessage>(await db.execute(sql`SELECT ${messageColumns} FROM chat_messages msg WHERE msg.actor_key = ${actor.key}
    AND msg.client_nonce = ${nonce}::uuid AND EXISTS (SELECT 1 FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    WHERE r.id = ${roomId}::uuid AND (${chatAccessSql(actor)}) AND c.active AND c.deleted_at IS NULL
      AND (${writableSql}))`))[0];
  if (!message) throw new Response("You cannot send to this conversation. Check the manager assignment or contact support.", { status: 403 });
  if (message.roomId !== roomId || !chatMessagePayloadMatches(message, body, attachment)) throw new Response("This message reference was already used. Refresh and try again.", { status: 409 });
  return serializeMessage(message);
}
export async function changeChatMessage(db: DatabaseClient, actor: ChatActor, roomId: string, id: string, body: string | null) {
  const message = chatRows<ChatMessage>(await db.execute(sql`WITH changed AS (
    UPDATE chat_messages msg SET body = ${body ?? ''}, edited_at = CASE WHEN ${body}::text IS NULL THEN msg.edited_at ELSE clock_timestamp() END,
      deleted_at = CASE WHEN ${body}::text IS NULL THEN clock_timestamp() ELSE NULL END
    WHERE msg.id = ${id}::uuid AND msg.room_id = ${roomId}::uuid AND msg.actor_key = ${actor.key} AND msg.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE r.id = msg.room_id AND c.active AND c.deleted_at IS NULL AND (${contentAccessSql(actor)}) AND (${writableSql})) RETURNING *
  ), updated AS (UPDATE chat_rooms r SET last_message_preview = CASE WHEN changed.deleted_at IS NOT NULL THEN 'Message deleted' ELSE left(COALESCE(NULLIF(changed.body, ''), changed.attachment->>'name'), 180) END,
    updated_at = greatest(r.updated_at, clock_timestamp()) FROM changed WHERE r.id = changed.room_id AND changed.id = (SELECT id FROM chat_messages WHERE room_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) RETURNING r.id)
  SELECT ${messageColumns} FROM changed`))[0];
  if (!message) throw new Response("Only your own available messages can be changed.", { status: 403 });
  return serializeMessage(message);
}
export async function getChatAttachment(db: DatabaseClient, actor: ChatActor, roomId: string, messageId: string) {
  const row = chatRows<{ attachment: ChatAttachment }>(await db.execute(sql`SELECT msg.attachment FROM chat_messages msg JOIN chat_rooms r ON r.id = msg.room_id
    JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE msg.id = ${messageId}::uuid AND r.id = ${roomId}::uuid
      AND msg.deleted_at IS NULL AND msg.attachment IS NOT NULL AND (${contentAccessSql(actor)})`))[0];
  if (!row) throw new Response("Attachment unavailable.", { status: 404 });
  return row.attachment;
}
export async function markChatRead(db: DatabaseClient, actor: ChatActor, roomId: string, messageId: string) {
  await db.execute(sql`INSERT INTO chat_reads (room_id, actor_key, last_read_at, last_read_id)
    SELECT r.id, ${actor.key}, msg.created_at, msg.id FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    JOIN chat_messages msg ON msg.room_id = r.id AND msg.id = ${messageId}::uuid WHERE r.id = ${roomId}::uuid AND (${contentAccessSql(actor)})
    ON CONFLICT (room_id, actor_key) DO UPDATE SET last_read_at = EXCLUDED.last_read_at, last_read_id = EXCLUDED.last_read_id
    WHERE (chat_reads.last_read_at, COALESCE(chat_reads.last_read_id, '00000000-0000-0000-0000-000000000000'::uuid)) < (EXCLUDED.last_read_at, EXCLUDED.last_read_id)`);
}
export async function chatPeople(db: DatabaseClient, actor: ChatActor, search = "") {
  if (!actor.admin) throw new Response("Administrator access required.", { status: 403 });
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const managers = chatRows<ChatPerson>(await db.execute(sql`SELECT id, COALESCE(name, email) AS name, email FROM users
    WHERE active AND deleted_at IS NULL AND role = 'project_manager' ORDER BY name, id LIMIT 200`));
  const clients = chatRows<ChatPerson>(await db.execute(sql`SELECT id, COALESCE(name, email) AS name, email FROM users
    WHERE active AND deleted_at IS NULL AND role NOT IN ('project_manager', 'customer_support')
      AND ${paidClientSql(sql`users.id`)}
      AND (${search} = '' OR name ILIKE ${pattern} OR email ILIKE ${pattern}) ORDER BY name, id LIMIT 30`));
  return { managers, clients };
}
export async function createChatRoomsForClient(db: DatabaseClient, actor: ChatActor, clientId: string) {
  if (!actor.admin) throw new Response("Administrator access required.", { status: 403 });
  const rows = chatRows<{ id: string }>(await db.execute(sql`INSERT INTO chat_rooms (client_id, kind)
    SELECT u.id, 'manager' FROM users u WHERE u.id = ${clientId}::uuid AND u.active
    AND u.deleted_at IS NULL AND u.role NOT IN ('project_manager', 'customer_support')
    AND ${paidClientSql(sql`u.id`)}
    AND EXISTS (SELECT 1 FROM admin_users a WHERE a.id = ${actor.id}::uuid AND a.active AND a.role = 'admin')
    ON CONFLICT (client_id) WHERE kind = 'manager' DO UPDATE SET client_id = EXCLUDED.client_id RETURNING id, kind`));
  if (!rows.length) throw new Response("Choose an active client with a paid purchase.", { status: 400 });
  await ensureClientChatRooms(db, actor);
  return rows;
}
export async function assignChatManager(db: DatabaseClient, actor: ChatActor, roomId: string, managerId: string | null, expectedManagerId: string | null) {
  if (!actor.admin) throw new Response("Administrator access required.", { status: 403 });
  const rows = chatRows<{ id: string }>(await db.execute(sql`WITH allowed AS (
    SELECT r.id, r.manager_id FROM chat_rooms r
    WHERE r.id = ${roomId}::uuid AND r.kind = 'manager' AND r.manager_id IS NOT DISTINCT FROM ${expectedManagerId}::uuid
    AND ${paidClientSql()}
    AND EXISTS (SELECT 1 FROM users c WHERE c.id = r.client_id AND c.active AND c.deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM admin_users a WHERE a.id = ${actor.id}::uuid AND a.active AND a.role = 'admin')
    AND (${managerId}::uuid IS NULL OR EXISTS (SELECT 1 FROM users m WHERE m.id = ${managerId}::uuid AND m.active AND m.deleted_at IS NULL AND m.role = 'project_manager'))
    FOR UPDATE OF r
  ), activity AS (
    INSERT INTO chat_messages (room_id, actor_key, sender_name, sender_role, body, client_nonce, created_at)
    SELECT allowed.id, 'system:assignment', 'Project activity', 'system',
      CASE WHEN ${managerId}::uuid IS NULL THEN 'Your project manager left the group. Our admin team is here to help while a new manager is assigned.'
      ELSE CASE WHEN m.name IS NULL OR btrim(m.name) = '' OR m.name ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
        THEN 'Project manager' ELSE btrim(m.name) END || ' joined the group as your project manager.' END,
      gen_random_uuid(), clock_timestamp()
    FROM allowed LEFT JOIN users m ON m.id = ${managerId}::uuid
    WHERE allowed.manager_id IS DISTINCT FROM ${managerId}::uuid
    RETURNING room_id, body, created_at
  ) UPDATE chat_rooms r SET manager_id = ${managerId}::uuid,
    updated_at = greatest(r.updated_at, COALESCE(activity.created_at, r.updated_at)),
    last_message_at = greatest(r.last_message_at, activity.created_at),
    last_message_preview = CASE WHEN activity.created_at IS NOT NULL AND (r.last_message_at IS NULL OR activity.created_at >= r.last_message_at)
      THEN left(activity.body, 180) ELSE r.last_message_preview END
    FROM allowed LEFT JOIN activity ON activity.room_id = allowed.id WHERE r.id = allowed.id RETURNING r.id`));
  if (!rows.length) throw new Response("The assignment changed or this manager is unavailable. Refresh and try again.", { status: 409 });
}

export async function createSupportTicket(db: DatabaseClient, actor: ChatActor, roomId: string, subject: string, category: TicketCategory, priority: TicketPriority, body: string) {
  if (chatIsStaff(actor)) throw new Response("Tickets are started by customers.", { status: 403 });
  // Ticket IDs double as the initial message nonce. Reject a nonce already
  // used in another room before inserting a room/ticket pair.
  const reference = chatRows<{ roomId: string }>(await db.execute(sql`SELECT room_id AS "roomId" FROM chat_messages WHERE actor_key = ${actor.key} AND client_nonce = ${roomId}::uuid`))[0];
  if (reference && reference.roomId !== roomId) throw new Response("Message reference already used.", { status: 409 });
  const rows = chatRows<{ id: string }>(await db.execute(sql`WITH created AS (
    INSERT INTO chat_rooms (id, client_id, kind, last_message_at, last_message_preview)
    SELECT ${roomId}::uuid, u.id, 'support', now(), left(${body}, 180) FROM users u
    WHERE u.id = ${actor.id}::uuid AND u.active AND u.deleted_at IS NULL AND u.role = ${actor.role}
      AND NOT EXISTS (SELECT 1 FROM chat_messages WHERE actor_key = ${actor.key} AND client_nonce = ${roomId}::uuid)
    ON CONFLICT (id) DO NOTHING RETURNING id
  ), ticket AS (
    INSERT INTO support_tickets (room_id, subject, category, priority) SELECT id, ${subject}, ${category}, ${priority} FROM created RETURNING room_id
  ), message AS (
    INSERT INTO chat_messages (room_id, actor_key, sender_user_id, sender_name, sender_role, body, client_nonce)
    SELECT room_id, ${actor.key}, ${actor.id}::uuid, ${actor.name}, ${actor.role}, ${body}, ${roomId}::uuid FROM ticket RETURNING room_id
  ) SELECT room_id AS id FROM message`));
  if (!rows.length) {
    const reference = chatRows<{ roomId: string }>(await db.execute(sql`SELECT room_id AS "roomId" FROM chat_messages WHERE actor_key = ${actor.key} AND client_nonce = ${roomId}::uuid`))[0];
    if (reference && reference.roomId !== roomId) throw new Response("Message reference already used.", { status: 409 });
    const existing = await getChatRoom(db, actor, roomId);
    const initial = await findChatMessageByNonce(db, actor, roomId, roomId);
    if (!existing.ticket || existing.ticket.subject !== subject || existing.ticket.category !== category || existing.ticket.priority !== priority || !initial || initial.body !== body) throw new Response("This ticket reference was already used. Refresh and try again.", { status: 409 });
  }
  return getChatRoom(db, actor, roomId);
}

export async function updateSupportTicket(db: DatabaseClient, actor: ChatActor, roomId: string, status: TicketStatus, priority: TicketPriority, expectedUpdatedAt: string) {
  if (!chatIsStaff(actor) && status === 'waiting_customer') throw new Response("Only the support team can request a customer response.", { status: 403 });
  const current = await getChatRoom(db, actor, roomId);
  if (!current.ticket) throw new Response("Choose a support ticket.", { status: 400 });
  if (!chatIsStaff(actor) && priority !== current.ticket.priority) throw new Response("Only the support team can change ticket priority.", { status: 403 });
  if (current.ticket.status === status && current.ticket.priority === priority) return current;
  const displayName = chatSenderName(actor.role, actor.name);
  const activity = current.ticket.status !== status
    ? `${displayName} ${status === 'closed' ? 'closed this ticket.' : current.ticket.status === 'closed' ? 'reopened this ticket.' : status === 'waiting_customer' ? 'requested a customer response.' : 'sent this ticket back to support.'}`
    : `${displayName} changed the priority to ${priority}.`;
  const rows = chatRows<{ id: string }>(await db.execute(sql`WITH allowed AS (
    SELECT r.id FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    WHERE r.id = ${roomId}::uuid AND r.kind = 'support' AND (${chatAccessSql(actor)}) AND c.active AND c.deleted_at IS NULL FOR UPDATE OF r
  ), changed AS (
    UPDATE support_tickets t SET status = ${status}, priority = ${priority}, updated_at = GREATEST(clock_timestamp(), t.updated_at + interval '1 millisecond'),
      closed_at = CASE WHEN ${status} = 'closed' THEN clock_timestamp() ELSE NULL END,
      closed_by = CASE WHEN ${status} = 'closed' THEN ${actor.key} ELSE NULL END
    FROM allowed WHERE t.room_id = allowed.id AND t.updated_at = ${expectedUpdatedAt}::timestamptz
      AND (${chatIsStaff(actor)} OR (t.priority = ${priority} AND ((${status} = 'closed' AND t.status <> 'closed') OR (${status} = 'waiting_support' AND t.status = 'closed'))))
    RETURNING t.room_id
  ), activity AS (
    INSERT INTO chat_messages (room_id, actor_key, sender_name, sender_role, body, client_nonce)
    SELECT room_id, 'system:ticket', 'Ticket activity', 'system', ${activity}, gen_random_uuid() FROM changed RETURNING room_id, body, created_at
  ) UPDATE chat_rooms r SET updated_at = activity.created_at, last_message_at = activity.created_at, last_message_preview = left(activity.body, 180)
    FROM activity WHERE r.id = activity.room_id RETURNING r.id`));
  if (!rows.length) throw new Response("This ticket changed. Refresh it before updating its status.", { status: 409 });
  return getChatRoom(db, actor, roomId);
}

export async function chatRecipients(db: DatabaseClient, roomId: string, previousManagerId?: string | null) {
  return chatRows<{ key: string }>(await db.execute(sql`SELECT 'user:' || u.id AS key FROM users u JOIN chat_rooms r ON r.id = ${roomId}::uuid
    WHERE u.active AND u.deleted_at IS NULL AND (u.id = r.client_id OR (r.kind = 'support' AND u.role = 'customer_support')
      OR (r.kind = 'manager' AND u.role = 'project_manager' AND (u.id = r.manager_id OR u.id = ${previousManagerId ?? null}::uuid)))
    UNION SELECT 'admin:' || a.id AS key FROM admin_users a WHERE a.active AND a.role = 'admin'`)).map(r => r.key);
}
