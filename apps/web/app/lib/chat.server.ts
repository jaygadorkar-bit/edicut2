import type { DatabaseClient } from "@edicut/db/client";
import { sql, type SQL } from "drizzle-orm";
import { CHAT_HISTORY_SIZE, CHAT_PAGE_SIZE, chatIsStaff, type ChatActor, type ChatAttachment, type ChatMessage, type ChatPerson, type ChatReceipt, type ChatRoom } from "./chat";

export function chatRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows?: T[] })?.rows ?? []) as T[];
}
export function isMissingChatSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; cause?: unknown };
  return (e.code === "42P01" && /chat_(rooms|messages|reads)/.test(e.message ?? "")) || Boolean(e.cause && isMissingChatSchema(e.cause));
}
// Always check the current database role, including inside writes. A stale session
// or a concurrent reassignment must never give a former manager access.
export function chatAccessSql(actor: ChatActor): SQL {
  if (actor.admin) return sql`EXISTS (SELECT 1 FROM admin_users a WHERE a.id = ${actor.id}::uuid AND a.active AND a.role = 'admin')`;
  const access = actor.role === "project_manager"
    ? sql`r.kind = 'manager' AND r.manager_id = ${actor.id}::uuid AND m.active AND m.deleted_at IS NULL AND m.role = 'project_manager'`
    : actor.role === "customer_support" ? sql`r.kind = 'support'` : sql`r.client_id = ${actor.id}::uuid`;
  return sql`c.active AND c.deleted_at IS NULL AND (${access}) AND EXISTS
    (SELECT 1 FROM users viewer WHERE viewer.id = ${actor.id}::uuid AND viewer.active AND viewer.deleted_at IS NULL AND viewer.role = ${actor.role})`;
}
const roomColumns = (actor: ChatActor) => sql`r.id, r.client_id AS "clientId", COALESCE(c.name, c.email) AS "clientName", c.email AS "clientEmail",
  (c.active AND c.deleted_at IS NULL) AS "clientActive", r.kind, r.manager_id AS "managerId", m.name AS "managerName",
  COALESCE(m.active AND m.deleted_at IS NULL AND m.role = 'project_manager', false) AS "managerActive",
  r.last_message_at AS "lastMessageAt", r.last_message_preview AS "lastMessagePreview", r.updated_at AS "updatedAt",
  (SELECT count(*)::int FROM chat_messages msg LEFT JOIN chat_reads rd ON rd.room_id = r.id AND rd.actor_key = ${actor.key}
   WHERE msg.room_id = r.id AND msg.actor_key <> ${actor.key} AND (rd.last_read_at IS NULL OR (msg.created_at, msg.id) > (rd.last_read_at, COALESCE(rd.last_read_id, '00000000-0000-0000-0000-000000000000'::uuid)))) AS "unreadCount"`;
const messageColumns = sql`id, room_id AS "roomId", actor_key AS "actorKey", sender_name AS "senderName", sender_role AS "senderRole", body, attachment, edited_at AS "editedAt", deleted_at AS "deletedAt", client_nonce AS "clientNonce", created_at AS "createdAt"`;
function serializeRoom(room: ChatRoom): ChatRoom {
  return { ...room, updatedAt: new Date(room.updatedAt).toISOString(), lastMessageAt: room.lastMessageAt ? new Date(room.lastMessageAt).toISOString() : null, unreadCount: Number(room.unreadCount) };
}
const serializeMessage = (m: ChatMessage): ChatMessage => ({ ...m, createdAt: new Date(m.createdAt).toISOString(), editedAt: m.editedAt ? new Date(m.editedAt).toISOString() : null, deletedAt: m.deletedAt ? new Date(m.deletedAt).toISOString() : null });

export async function ensureClientChatRooms(db: DatabaseClient, actor: ChatActor) {
  if (chatIsStaff(actor)) return;
  await db.execute(sql`INSERT INTO chat_rooms (client_id, kind)
    SELECT u.id, k.kind FROM users u CROSS JOIN (VALUES ('manager'), ('support')) k(kind)
    WHERE u.id = ${actor.id}::uuid AND u.active AND u.deleted_at IS NULL AND u.role = ${actor.role}
    ON CONFLICT (client_id, kind) DO NOTHING`);
}
export async function listChatRooms(db: DatabaseClient, actor: ChatActor, page = 1, search = "", filter = "all") {
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const rooms = chatRows<ChatRoom>(await db.execute(sql`SELECT ${roomColumns(actor)} FROM chat_rooms r
    JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    WHERE (${chatAccessSql(actor)}) AND (${search} = '' OR c.name ILIKE ${pattern} OR c.email ILIKE ${pattern} OR r.last_message_preview ILIKE ${pattern})
    AND (${filter} = 'all' OR r.kind = ${filter})
    ORDER BY r.updated_at DESC, r.id DESC LIMIT ${CHAT_PAGE_SIZE + 1} OFFSET ${(page - 1) * CHAT_PAGE_SIZE}`));
  return { rooms: rooms.slice(0, CHAT_PAGE_SIZE).map(serializeRoom), hasMore: rooms.length > CHAT_PAGE_SIZE, page, ready: true };
}
export async function getChatRoom(db: DatabaseClient, actor: ChatActor, id: string) {
  const room = chatRows<ChatRoom>(await db.execute(sql`SELECT ${roomColumns(actor)} FROM chat_rooms r JOIN users c ON c.id = r.client_id
    LEFT JOIN users m ON m.id = r.manager_id WHERE r.id = ${id}::uuid AND (${chatAccessSql(actor)})`))[0];
  if (!room) throw new Response("This conversation is unavailable.", { status: 404 });
  return serializeRoom(room);
}
export async function listChatMessages(db: DatabaseClient, actor: ChatActor, roomId: string, before?: { at: string; id: string }, search = "") {
  const room = await getChatRoom(db, actor, roomId);
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const messages = chatRows<ChatMessage>(await db.execute(sql`SELECT ${messageColumns} FROM chat_messages
    WHERE room_id = ${roomId}::uuid AND (${before ? sql`(created_at, id) < (${before.at}::timestamptz, ${before.id}::uuid)` : sql`true`})
    AND (${search} = '' OR (deleted_at IS NULL AND (body ILIKE ${pattern} OR attachment->>'name' ILIKE ${pattern})))
    AND EXISTS (SELECT 1 FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE r.id = ${roomId}::uuid AND (${chatAccessSql(actor)}))
    ORDER BY created_at DESC, id DESC LIMIT ${CHAT_HISTORY_SIZE + 1}`));
  const receipts = chatRows<ChatReceipt>(await db.execute(sql`SELECT rd.actor_key AS "actorKey", COALESCE(u.name, a.name, 'Team member') AS name,
    CASE WHEN a.id IS NOT NULL THEN 'admin' ELSE u.role END AS role, rd.last_read_at AS "lastReadAt", rd.last_read_id AS "lastReadId"
    FROM chat_reads rd LEFT JOIN users u ON rd.actor_key = 'user:' || u.id LEFT JOIN admin_users a ON rd.actor_key = 'admin:' || a.id
    WHERE rd.room_id = ${roomId}::uuid AND rd.actor_key <> ${actor.key}
    AND EXISTS (SELECT 1 FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE r.id = ${roomId}::uuid AND (${chatAccessSql(actor)}))
    ORDER BY rd.last_read_at DESC LIMIT 100`)).map(r => ({ ...r, lastReadAt: new Date(r.lastReadAt).toISOString() }));
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
    SELECT r.id FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    WHERE r.id = ${roomId}::uuid AND (${chatAccessSql(actor)}) AND c.active AND c.deleted_at IS NULL
    AND (${actor.admin} OR r.kind = 'support' OR (m.active AND m.deleted_at IS NULL AND m.role = 'project_manager'))
    FOR UPDATE OF r
  ), inserted AS (
    INSERT INTO chat_messages (room_id, actor_key, sender_user_id, sender_admin_id, sender_name, sender_role, body, client_nonce, attachment)
    SELECT id, ${actor.key}, ${actor.admin ? null : actor.id}::uuid, ${actor.admin ? actor.id : null}::uuid, ${actor.name}, ${actor.role}, ${body}, ${nonce}::uuid, ${attachment ? JSON.stringify(attachment) : null}::jsonb FROM allowed
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
      AND (${actor.admin} OR r.kind = 'support' OR (m.active AND m.deleted_at IS NULL AND m.role = 'project_manager')))`))[0];
  if (!message) throw new Response("You cannot send to this conversation. Check the manager assignment or contact support.", { status: 403 });
  if (message.roomId !== roomId || message.body !== body) throw new Response("This message reference was already used. Refresh and try again.", { status: 409 });
  return serializeMessage(message);
}
export async function changeChatMessage(db: DatabaseClient, actor: ChatActor, roomId: string, id: string, body: string | null) {
  const message = chatRows<ChatMessage>(await db.execute(sql`WITH changed AS (
    UPDATE chat_messages msg SET body = ${body ?? ''}, edited_at = CASE WHEN ${body}::text IS NULL THEN msg.edited_at ELSE clock_timestamp() END,
      deleted_at = CASE WHEN ${body}::text IS NULL THEN clock_timestamp() ELSE NULL END
    WHERE msg.id = ${id}::uuid AND msg.room_id = ${roomId}::uuid AND msg.actor_key = ${actor.key} AND msg.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE r.id = msg.room_id AND (${chatAccessSql(actor)})) RETURNING *
  ), updated AS (UPDATE chat_rooms r SET last_message_preview = CASE WHEN changed.deleted_at IS NOT NULL THEN 'Message deleted' ELSE left(COALESCE(NULLIF(changed.body, ''), changed.attachment->>'name'), 180) END,
    updated_at = clock_timestamp() FROM changed WHERE r.id = changed.room_id AND changed.id = (SELECT id FROM chat_messages WHERE room_id = r.id ORDER BY created_at DESC, id DESC LIMIT 1) RETURNING r.id)
  SELECT ${messageColumns} FROM changed`))[0];
  if (!message) throw new Response("Only your own available messages can be changed.", { status: 403 });
  return serializeMessage(message);
}
export async function getChatAttachment(db: DatabaseClient, actor: ChatActor, roomId: string, messageId: string) {
  const row = chatRows<{ attachment: ChatAttachment }>(await db.execute(sql`SELECT msg.attachment FROM chat_messages msg JOIN chat_rooms r ON r.id = msg.room_id
    JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id WHERE msg.id = ${messageId}::uuid AND r.id = ${roomId}::uuid
      AND msg.deleted_at IS NULL AND msg.attachment IS NOT NULL AND (${chatAccessSql(actor)})`))[0];
  if (!row) throw new Response("Attachment unavailable.", { status: 404 });
  return row.attachment;
}
export async function markChatRead(db: DatabaseClient, actor: ChatActor, roomId: string, messageId: string) {
  await db.execute(sql`INSERT INTO chat_reads (room_id, actor_key, last_read_at, last_read_id)
    SELECT r.id, ${actor.key}, msg.created_at, msg.id FROM chat_rooms r JOIN users c ON c.id = r.client_id LEFT JOIN users m ON m.id = r.manager_id
    JOIN chat_messages msg ON msg.room_id = r.id AND msg.id = ${messageId}::uuid WHERE r.id = ${roomId}::uuid AND (${chatAccessSql(actor)})
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
      AND (${search} = '' OR name ILIKE ${pattern} OR email ILIKE ${pattern}) ORDER BY name, id LIMIT 30`));
  return { managers, clients };
}
export async function createChatRoomsForClient(db: DatabaseClient, actor: ChatActor, clientId: string) {
  if (!actor.admin) throw new Response("Administrator access required.", { status: 403 });
  const rows = chatRows<{ id: string }>(await db.execute(sql`INSERT INTO chat_rooms (client_id, kind)
    SELECT u.id, k.kind FROM users u CROSS JOIN (VALUES ('manager'), ('support')) k(kind) WHERE u.id = ${clientId}::uuid AND u.active
    AND u.deleted_at IS NULL AND u.role NOT IN ('project_manager', 'customer_support')
    AND EXISTS (SELECT 1 FROM admin_users a WHERE a.id = ${actor.id}::uuid AND a.active AND a.role = 'admin')
    ON CONFLICT (client_id, kind) DO UPDATE SET client_id = EXCLUDED.client_id RETURNING id, kind`));
  if (!rows.length) throw new Response("Choose an active client account.", { status: 400 });
  return rows;
}
export async function assignChatManager(db: DatabaseClient, actor: ChatActor, roomId: string, managerId: string | null, expectedManagerId: string | null) {
  if (!actor.admin) throw new Response("Administrator access required.", { status: 403 });
  const rows = chatRows<{ id: string }>(await db.execute(sql`UPDATE chat_rooms r SET manager_id = ${managerId}::uuid, updated_at = clock_timestamp()
    WHERE r.id = ${roomId}::uuid AND r.kind = 'manager' AND r.manager_id IS NOT DISTINCT FROM ${expectedManagerId}::uuid
    AND EXISTS (SELECT 1 FROM users c WHERE c.id = r.client_id AND c.active AND c.deleted_at IS NULL)
    AND EXISTS (SELECT 1 FROM admin_users a WHERE a.id = ${actor.id}::uuid AND a.active AND a.role = 'admin')
    AND (${managerId}::uuid IS NULL OR EXISTS (SELECT 1 FROM users m WHERE m.id = ${managerId}::uuid AND m.active AND m.deleted_at IS NULL AND m.role = 'project_manager')) RETURNING r.id`));
  if (!rows.length) throw new Response("The assignment changed or this manager is unavailable. Refresh and try again.", { status: 409 });
}
export async function chatRecipients(db: DatabaseClient, roomId: string, previousManagerId?: string | null) {
  return chatRows<{ key: string }>(await db.execute(sql`SELECT 'user:' || u.id AS key FROM users u JOIN chat_rooms r ON r.id = ${roomId}::uuid
    WHERE u.active AND u.deleted_at IS NULL AND (u.id = r.client_id OR (r.kind = 'support' AND u.role = 'customer_support')
      OR (r.kind = 'manager' AND u.role = 'project_manager' AND (u.id = r.manager_id OR u.id = ${previousManagerId ?? null}::uuid)))
    UNION SELECT 'admin:' || a.id AS key FROM admin_users a WHERE a.active AND a.role = 'admin'`)).map(r => r.key);
}
