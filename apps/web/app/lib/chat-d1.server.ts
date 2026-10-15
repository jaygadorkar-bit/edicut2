import { CHAT_HISTORY_SIZE, CHAT_PAGE_SIZE, chatIsStaff, chatMessagePayloadMatches, chatSenderName, sanitizeChatMessageBody, type ChatActor, type ChatAttachment, type ChatHistory, type ChatMessage, type ChatPerson, type ChatReceipt, type ChatRoom, type ChatView, type TicketCategory, type TicketPriority, type TicketStatus } from "./chat";
import type { ChatAuthority } from "./chat-authority.server";
import type { ChatStore } from "./chat-store.server";

const live = `WITH source AS (SELECT ? AS data),
  live_users AS (SELECT json_extract(value,'$.id') id, json_extract(value,'$.email') email,
    json_extract(value,'$.name') name, json_extract(value,'$.searchName') search_name, json_extract(value,'$.searchEmail') search_email, json_extract(value,'$.role') role,
    json_extract(value,'$.active') active, json_extract(value,'$.deletedAt') deleted_at, json_extract(value,'$.avatarUrl') avatar_url,
    json_extract(value,'$.paid') paid FROM source,json_each(source.data,'$.users')),
  live_admins AS (SELECT json_extract(value,'$.id') id, json_extract(value,'$.email') email,
    json_extract(value,'$.name') name, json_extract(value,'$.searchName') search_name, json_extract(value,'$.searchEmail') search_email, json_extract(value,'$.role') role,
    json_extract(value,'$.active') active, json_extract(value,'$.avatarUrl') avatar_url FROM source,json_each(source.data,'$.admins'))`;
const joins = "chat_rooms r JOIN live_users c ON c.id=r.client_id LEFT JOIN live_users m ON m.id=r.manager_id LEFT JOIN support_tickets t ON t.room_id=r.id";
const uuidSql = "(lower(hex(randomblob(4)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(2)))||'-'||lower(hex(randomblob(6))))";
const eligible = "((r.kind='manager' AND c.paid) OR (r.kind='support' AND t.room_id IS NOT NULL))";
const writable = "c.active AND c.deleted_at IS NULL AND ((r.kind='manager' AND c.paid) OR (r.kind='support' AND t.status<>'closed'))";
const content = "(r.kind='support' OR c.paid)";
const messageColumns = `id,room_id AS roomId,actor_key AS actorKey,sender_name AS senderName,sender_role AS senderRole,body,attachment,edited_at AS editedAt,deleted_at AS deletedAt,client_nonce AS clientNonce,created_at AS createdAt`;
const escapeSearch = (value: string) => `%${value.replace(/[\\%_]/g, "\\$&")}%`;
const preview = (value: string) => Array.from(value).slice(0, 180).join('');
const fail = (message: string, status: number): never => { throw new Response(message, { status }); };
const message = (row: ChatMessage & { attachment: string | ChatAttachment | null }): ChatMessage => ({ ...row, senderName: chatSenderName(row.senderRole, row.senderName), body: sanitizeChatMessageBody(row.actorKey, row.body), attachment: typeof row.attachment === "string" ? JSON.parse(row.attachment) : row.attachment });
const room = (row: ChatRoom & { ticket: string | ChatRoom["ticket"]; participants?: string | ChatRoom["participants"] }, actor?: ChatActor): ChatRoom => {
  const participants = (typeof row.participants === "string" ? JSON.parse(row.participants) : row.participants ?? []) as ChatRoom["participants"];
  return { ...row, clientName: actor && !actor.admin ? chatSenderName("customer", row.clientName) : row.clientName,
    clientActive: Boolean(row.clientActive), managerActive: Boolean(row.managerActive), projectUnlocked: Boolean(row.projectUnlocked), lastMessageRead: Boolean(row.lastMessageRead), unreadCount: Number(row.unreadCount), managerName: row.managerName ? chatSenderName("project_manager", row.managerName) : null,
    ticket: typeof row.ticket === "string" ? JSON.parse(row.ticket) : row.ticket, participants: participants?.map(participant => ({ ...participant, name: chatSenderName(participant.role, participant.name) })) };
};

/** All SQL uses prepared bindings. Authority is fetched afresh per operation;
 * concurrent D1 assignment/ticket/nonce guards run inside the same batch. */
export function createD1ChatStore(d1: D1Database, authority: (actor?: ChatActor) => Promise<ChatAuthority>): ChatStore {
  async function session(actor?: ChatActor) {
    const current = await authority(actor);
    if (actor) {
      const viewer = (actor.admin ? current.admins : current.users).find(user => user.id === actor.id);
      if (!viewer?.active || "deletedAt" in viewer && viewer.deletedAt || viewer.role !== actor.role || actor.admin && actor.role !== "admin") fail("This account is unavailable.", 403);
    }
    const data = JSON.stringify({ ...current, users: current.users.map(user => ({ ...user, searchName: user.name?.toLowerCase() ?? null, searchEmail: user.email.toLowerCase() })) });
    const query = (statement: string, ...values: (string | number | null)[]) => d1.prepare(`${live} ${statement}`).bind(data, ...values);
    const access = (a: ChatActor) => {
      const values = [a.id, a.role];
      const sql = a.admin ? `${eligible} AND EXISTS (SELECT 1 FROM live_admins a WHERE a.id=? AND a.active AND a.role=?)`
        : `c.active AND c.deleted_at IS NULL AND EXISTS (SELECT 1 FROM live_users viewer WHERE viewer.id=? AND viewer.active AND viewer.deleted_at IS NULL AND viewer.role=?) AND ` +
          (a.role === "project_manager" ? `${eligible} AND r.kind='manager' AND r.manager_id=? AND m.active AND m.deleted_at IS NULL AND m.role='project_manager'`
            : a.role === "customer_support" ? `${eligible} AND r.kind='support'`
              : "r.client_id=? AND (r.kind='manager' OR t.room_id IS NOT NULL)");
      if (!a.admin && a.role !== "customer_support") values.push(a.id);
      return { sql, values };
    };
    const unread = (a: ChatActor) => ({ sql: "msg.deleted_at IS NULL AND msg.actor_key<>? AND (rd.last_read_at IS NULL OR (msg.created_at,msg.id)>(rd.last_read_at,COALESCE(rd.last_read_id,'00000000-0000-0000-0000-000000000000')))", values: [a.key] });
    const columns = (a: ChatActor) => {
      const unseen = unread(a);
      const clientParticipant = chatIsStaff(a) ? `UNION ALL SELECT 'user:'||member_client.id,COALESCE(member_client.name,${a.admin ? "member_client.email" : "'Client'"}),member_client.role,member_client.avatar_url FROM live_users member_client WHERE member_client.id=r.client_id AND member_client.active AND member_client.deleted_at IS NULL` : "";
      return { sql: `r.id,r.client_id AS clientId,COALESCE(c.name,${a.admin ? "c.email" : "'Client'"}) AS clientName,CASE WHEN ${a.admin ? 1 : 0}=1 THEN c.email ELSE NULL END AS clientEmail,
        (c.active AND c.deleted_at IS NULL) AS clientActive,r.kind,r.manager_id AS managerId,m.name AS managerName,
        COALESCE(m.active AND m.deleted_at IS NULL AND m.role='project_manager',0) AS managerActive,
        r.last_message_at AS lastMessageAt,CASE WHEN ${content} THEN r.last_message_preview ELSE NULL END AS lastMessagePreview,
        CASE WHEN ${content} THEN (SELECT latest.actor_key FROM chat_messages latest WHERE latest.room_id=r.id ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1) ELSE NULL END AS lastMessageActorKey,
        CASE WHEN ${content} THEN EXISTS (
          SELECT 1 FROM chat_messages latest JOIN chat_reads receipt ON receipt.room_id=latest.room_id
          WHERE latest.id=(SELECT newest.id FROM chat_messages newest WHERE newest.room_id=r.id ORDER BY newest.created_at DESC,newest.id DESC LIMIT 1)
            AND receipt.actor_key<>latest.actor_key
            AND (receipt.last_read_at,COALESCE(receipt.last_read_id,'00000000-0000-0000-0000-000000000000')) >= (latest.created_at,latest.id)
            AND (receipt.actor_key='user:'||r.client_id
              OR receipt.actor_key IN (SELECT 'admin:'||reader.id FROM live_admins reader WHERE reader.active AND reader.role='admin')
              OR (r.manager_id IS NOT NULL AND receipt.actor_key='user:'||r.manager_id AND m.active AND m.deleted_at IS NULL AND m.role='project_manager'))
        ) ELSE 0 END AS lastMessageRead,
        CASE WHEN r.kind='manager' AND c.paid THEN (SELECT COALESCE(json_group_array(json_object('key',member.actor_key,'name',member.name,'role',member.role,'avatarUrl',member.avatar_url,'lastActiveAt',
          CASE WHEN member.actor_key='admin:team' THEN (SELECT max(team_activity.active_at) FROM (
            SELECT rd.last_read_at AS active_at FROM chat_reads rd WHERE rd.room_id=r.id AND rd.actor_key IN (SELECT 'admin:'||team.id FROM live_admins team WHERE team.active AND team.role='admin')
            UNION ALL SELECT msg.created_at FROM chat_messages msg WHERE msg.room_id=r.id AND msg.actor_key IN (SELECT 'admin:'||team.id FROM live_admins team WHERE team.active AND team.role='admin')
          ) team_activity) ELSE (SELECT max(activity.active_at) FROM (
            SELECT rd.last_read_at AS active_at FROM chat_reads rd WHERE rd.room_id=r.id AND rd.actor_key=member.actor_key
            UNION ALL SELECT msg.created_at FROM chat_messages msg WHERE msg.room_id=r.id AND msg.actor_key=member.actor_key
          ) activity) END)), '[]') FROM (
          SELECT 'admin:team' AS actor_key,'EdiCut Admin' AS name,'admin' AS role,NULL AS avatar_url WHERE EXISTS (SELECT 1 FROM live_admins team WHERE team.active AND team.role='admin')
          UNION ALL SELECT 'user:'||participant_manager.id,COALESCE(participant_manager.name,${a.admin ? "participant_manager.email" : "'Project manager'"}),'project_manager',participant_manager.avatar_url FROM live_users participant_manager WHERE participant_manager.id=r.manager_id AND participant_manager.active AND participant_manager.deleted_at IS NULL AND participant_manager.role='project_manager'
          ${clientParticipant}
        ) member WHERE member.actor_key<>?) ELSE '[]' END AS participants,
        r.updated_at AS updatedAt,c.paid AS projectUnlocked,
        CASE WHEN t.room_id IS NULL THEN NULL ELSE json_object('number',t.ticket_number,'subject',t.subject,'category',t.category,'priority',t.priority,'status',t.status,'closedAt',t.closed_at,'updatedAt',t.updated_at) END AS ticket,
        (SELECT count(*) FROM chat_messages msg LEFT JOIN chat_reads rd ON rd.room_id=r.id AND rd.actor_key=? WHERE msg.room_id=r.id AND ${content} AND ${unseen.sql}) AS unreadCount`, values: [a.key,a.key, ...unseen.values] };
    };
    async function getRoom(a: ChatActor, id: string) {
      const col = columns(a), gate = access(a);
      const found = await query(`SELECT ${col.sql} FROM ${joins} WHERE r.id=? AND (${gate.sql})`, ...col.values, id, ...gate.values).first<ChatRoom>();
      if (!found) return fail("This conversation is unavailable.", 404);
      return room(found, a);
    }
    function roomsQuery(a: ChatActor, page: number, search: string, filter: string, view: ChatView) {
      const col = columns(a), gate = access(a), pattern = escapeSearch(search.toLowerCase());
      return query(`SELECT ${col.sql} FROM ${joins} WHERE (${gate.sql}) AND r.kind=?
        AND (?='' OR c.search_name LIKE ? ESCAPE '\\' OR c.search_email LIKE ? ESCAPE '\\' OR (${content} AND r.search_preview LIKE ? ESCAPE '\\') OR t.search_subject LIKE ? ESCAPE '\\' OR CAST(t.ticket_number AS TEXT) LIKE ? ESCAPE '\\')
        AND (?=1 OR (?='open' AND t.status<>'closed') OR t.status=?) ORDER BY r.updated_at DESC,r.id DESC LIMIT ? OFFSET ?`,
      ...col.values, ...gate.values, view === "tickets" ? "support" : "manager", search, pattern, pattern, pattern, pattern, pattern, view !== "tickets" || filter === "all" ? 1 : 0, filter, filter, CHAT_PAGE_SIZE + 1, (page - 1) * CHAT_PAGE_SIZE);
    }
    function countsQuery(a: ChatActor) { const gate = access(a); return query(`SELECT t.status,count(*) AS count FROM ${joins} WHERE (${gate.sql}) AND r.kind='support' GROUP BY t.status`, ...gate.values); }
    async function listRooms(a: ChatActor, page = 1, search = "", filter = "all", view: ChatView = "projects") {
      const results = await d1.batch([roomsQuery(a, page, search, filter, view), ...(view === "tickets" ? [countsQuery(a)] : [])]);
      const rows = results[0].results as ChatRoom[], ticketCounts = { all: 0, waiting_support: 0, waiting_customer: 0, closed: 0 };
      for (const row of (results[1]?.results ?? []) as { status: TicketStatus; count: number }[]) { ticketCounts[row.status] = Number(row.count); ticketCounts.all += Number(row.count); }
      return { rooms: rows.slice(0, CHAT_PAGE_SIZE).map(row => room(row, actor)), page, hasMore: rows.length > CHAT_PAGE_SIZE, ready: true, ...(view === "tickets" ? { ticketCounts } : {}) };
    }
    async function unreadCounts(a: ChatActor) {
      const gate = access(a), unseen = unread(a);
      const result = await query(`SELECT COALESCE(sum(r.kind='manager'),0) AS projects,COALESCE(sum(r.kind='support'),0) AS tickets FROM ${joins} JOIN chat_messages msg ON msg.room_id=r.id LEFT JOIN chat_reads rd ON rd.room_id=r.id AND rd.actor_key=? WHERE (${gate.sql}) AND ${content} AND ${unseen.sql}`, a.key, ...gate.values, ...unseen.values).first<{ projects: number; tickets: number }>();
      return { projects: Number(result?.projects ?? 0), tickets: Number(result?.tickets ?? 0) };
    }
    async function history(a: ChatActor, id: string, before?: { at: string; id: string }, search = ""): Promise<ChatHistory> {
      const selected = await getRoom(a, id);
      if (selected.kind === "manager" && !selected.projectUnlocked) return { room: selected, messages: [], hasOlder: false, receipts: [] };
      const gate = access(a), allowed = `EXISTS (SELECT 1 FROM ${joins} WHERE r.id=? AND (${gate.sql}) AND ${content})`,
        receiptAllowed = `EXISTS (SELECT 1 FROM ${joins} WHERE r.id=? AND (${gate.sql}) AND ${content}
          AND ((c.active AND c.deleted_at IS NULL AND rd.actor_key='user:'||r.client_id)
            OR (r.kind='manager' AND m.active AND m.deleted_at IS NULL AND m.role='project_manager' AND rd.actor_key='user:'||m.id)
            OR rd.actor_key IN (SELECT 'admin:'||reader.id FROM live_admins reader WHERE reader.active AND reader.role='admin')
            OR (r.kind='support' AND rd.actor_key IN (SELECT 'user:'||support.id FROM live_users support WHERE support.active AND support.deleted_at IS NULL AND support.role='customer_support'))))`,
        pattern = escapeSearch(search.toLowerCase());
      const result = await d1.batch([
        query(`SELECT ${messageColumns} FROM chat_messages WHERE room_id=? AND (? IS NULL OR (created_at,id)<(?,?)) AND (?='' OR (deleted_at IS NULL AND (search_body LIKE ? ESCAPE '\\' OR search_attachment LIKE ? ESCAPE '\\'))) AND ${allowed} ORDER BY created_at DESC,id DESC LIMIT ?`, id, before?.at ? new Date(before.at).toISOString() : null, before?.at ? new Date(before.at).toISOString() : null, before?.id ?? null, search, pattern, pattern, id, ...gate.values, CHAT_HISTORY_SIZE + 1),
        query(`SELECT rd.actor_key AS actorKey,COALESCE(u.name,a.name,'Team member') AS name,CASE WHEN a.id IS NOT NULL THEN 'admin' ELSE u.role END AS role,rd.last_read_at AS lastReadAt,rd.last_read_id AS lastReadId FROM chat_reads rd LEFT JOIN live_users u ON rd.actor_key='user:'||u.id LEFT JOIN live_admins a ON rd.actor_key='admin:'||a.id WHERE rd.room_id=? AND rd.actor_key<>? AND ${receiptAllowed} ORDER BY rd.last_read_at DESC LIMIT 100`, id, a.key, id, ...gate.values),
      ]);
      const rows = result[0].results as ChatMessage[];
      return { room: selected, messages: rows.slice(0, CHAT_HISTORY_SIZE).map(message).reverse(), hasOlder: rows.length > CHAT_HISTORY_SIZE, receipts: (result[1].results as ChatReceipt[]).map(receipt => ({ ...receipt, name: chatSenderName(receipt.role, receipt.name) })) };
    }
    /** Copies only missing FK identities. Authorization always uses live_* CTEs. */
    function identityStatements() {
      return [
        query(`INSERT INTO users (id,email,name,role,active,deleted_at) SELECT id,email,name,role,active,deleted_at FROM live_users WHERE true ON CONFLICT(id) DO NOTHING`),
        query(`INSERT INTO admin_users (id,email,name,role,active) SELECT id,email,name,role,active FROM live_admins WHERE true ON CONFLICT(id) DO NOTHING`),
      ];
    }
    async function identities() { await d1.batch(identityStatements()); }
    return { current, query, access, getRoom, listRooms, unreadCounts, history, identityStatements, identities };
  }
  const store: ChatStore = {
    async ensureClientChatRooms(actor) {
      if (actor.role === "customer_support") return;
      const s = await session(actor); const at = new Date().toISOString(), gate = s.access(actor);
      const statements = s.identityStatements();
      if (actor.admin || !chatIsStaff(actor)) statements.push(s.query(`INSERT INTO chat_rooms (id,client_id,kind,created_at,updated_at) SELECT ${uuidSql},u.id,'manager',?,? FROM live_users u WHERE u.active AND u.deleted_at IS NULL AND u.role NOT IN ('project_manager','customer_support') AND ${actor.admin ? "u.paid" : "u.id=? AND u.role=?"} ON CONFLICT(client_id) WHERE kind='manager' DO NOTHING`, at, at, ...actor.admin ? [] : [actor.id, actor.role]));
      statements.push(s.query(`INSERT INTO chat_messages (id,room_id,actor_key,sender_name,sender_role,body,client_nonce,created_at,search_body) SELECT ${uuidSql},r.id,'system:admin','EdiCut Admin','admin','A manager will be assigned to you shortly. You can message our admin team here while you wait.',r.id,?, 'a manager will be assigned to you shortly. you can message our admin team here while you wait.' FROM ${joins} WHERE r.kind='manager' AND c.paid AND (${gate.sql}) ON CONFLICT(actor_key,client_nonce) DO NOTHING`, at, ...gate.values));
      statements.push(s.query(`UPDATE chat_rooms SET last_message_at=msg.created_at,last_message_preview=substr(msg.body,1,180),search_preview=substr(msg.search_body,1,180),updated_at=max(chat_rooms.updated_at,msg.created_at) FROM chat_messages msg WHERE msg.room_id=chat_rooms.id AND msg.actor_key='system:admin' AND msg.client_nonce=chat_rooms.id AND (chat_rooms.last_message_at IS NULL OR chat_rooms.last_message_at<msg.created_at) AND chat_rooms.id IN (SELECT r.id FROM ${joins} WHERE r.kind='manager' AND (${gate.sql}))`, ...gate.values));
      await d1.batch(statements);
    },
    async listChatRooms(actor, page, search, filter, view) { return (await session(actor)).listRooms(actor, page, search, filter, view); },
    async getChatRoom(actor, id) { return (await session(actor)).getRoom(actor, id); },
    async getChatUnreadCounts(actor) { return (await session(actor)).unreadCounts(actor); },
    async getChatSnapshot(actor, options) {
      const s = await session(actor), [state, unread, history] = await Promise.all([s.listRooms(actor, options.page, options.search, options.filter, options.view), s.unreadCounts(actor), options.roomId ? s.history(actor, options.roomId, undefined, options.messageSearch).catch(error => { if (error instanceof Response && error.status === 404) return null; throw error; }) : null]);
      return { state, unread, history, historyUnavailable: Boolean(options.roomId && !history) };
    },
    async listChatMessages(actor, id, before, search) { return (await session(actor)).history(actor, id, before, search); },
    async findChatMessageByNonce(actor, id, nonce) { const s = await session(actor); await s.getRoom(actor, id); const found = await s.query(`SELECT ${messageColumns} FROM chat_messages WHERE actor_key=? AND client_nonce=?`, actor.key, nonce.toLowerCase()).first<ChatMessage>(); if (found && found.roomId !== id) fail("Message reference already used.", 409); return found ? message(found) : null; },
    async sendChatMessage(actor, id, body, nonce, attachment = null) {
      const s = await session(actor); const gate = s.access(actor), newId = crypto.randomUUID(), at = new Date().toISOString(), nonceKey = nonce.toLowerCase();
      const results = await d1.batch([...s.identityStatements(),
        s.query(`INSERT INTO chat_messages (id,room_id,actor_key,sender_user_id,sender_admin_id,sender_name,sender_role,body,client_nonce,attachment,created_at,search_body,search_attachment) SELECT ?,r.id,?,?,?,?,?,?,?,?,?,?,? FROM ${joins} WHERE r.id=? AND (${gate.sql}) AND ${writable} ON CONFLICT(actor_key,client_nonce) DO NOTHING`, newId, actor.key, actor.admin ? null : actor.id, actor.admin ? actor.id : null, actor.name, actor.role, body, nonceKey, attachment ? JSON.stringify(attachment) : null, at, body.toLowerCase(), attachment?.name.toLowerCase() ?? "", id, ...gate.values),
        d1.prepare(`UPDATE support_tickets SET status=?,updated_at=max(?,strftime('%Y-%m-%dT%H:%M:%fZ',julianday(updated_at)+1.0/86400000.0)) WHERE room_id=? AND EXISTS (SELECT 1 FROM chat_messages WHERE id=?)`).bind(chatIsStaff(actor) ? "waiting_customer" : "waiting_support", at, id, newId),
        d1.prepare(`UPDATE chat_rooms SET last_message_at=max(COALESCE(last_message_at,?),?),last_message_preview=CASE WHEN last_message_at IS NULL OR last_message_at<=? THEN ? ELSE last_message_preview END,search_preview=CASE WHEN last_message_at IS NULL OR last_message_at<=? THEN ? ELSE search_preview END,updated_at=max(updated_at,?) WHERE id=? AND EXISTS (SELECT 1 FROM chat_messages WHERE id=?)`).bind(at, at, at, preview(body || attachment?.name || ""), at, preview(body || attachment?.name || "").toLowerCase(), at, id, newId),
        s.query(`SELECT ${messageColumns} FROM chat_messages WHERE actor_key=? AND client_nonce=? AND EXISTS (SELECT 1 FROM ${joins} WHERE r.id=? AND (${gate.sql}) AND ${writable})`, actor.key, nonceKey, id, ...gate.values),
      ]);
      const saved = results.at(-1)?.results?.[0] as ChatMessage | undefined;
      if (!saved) {
        const canRetry = await s.query(`SELECT 1 AS allowed FROM ${joins} WHERE r.id=? AND (${gate.sql}) AND ${writable}`, id, ...gate.values).first<{ allowed: number }>();
        if (!canRetry) return fail("You cannot send to this conversation. Check the manager assignment or contact support.", 403);
        const existing = await d1.prepare(`SELECT ${messageColumns} FROM chat_messages WHERE actor_key=? AND client_nonce=?`).bind(actor.key, nonceKey).first<ChatMessage>();
        if (existing) {
          const prior = message(existing as ChatMessage & { attachment: string | ChatAttachment | null });
          if (prior.roomId !== id || !chatMessagePayloadMatches(prior, body, attachment)) fail("This message reference was already used. Refresh and try again.", 409);
          return prior;
        }
        return fail("You cannot send to this conversation. Check the manager assignment or contact support.", 403);
      }
      if (saved.roomId !== id || !chatMessagePayloadMatches(message(saved), body, attachment)) fail("This message reference was already used. Refresh and try again.", 409);
      return message(saved);
    },
    async changeChatMessage(actor, id, messageId, body) {
      const s = await session(actor), gate = s.access(actor), at = new Date().toISOString();
      const result = await d1.batch([
        s.query(`UPDATE chat_messages SET body=?,search_body=?,edited_at=CASE WHEN ? IS NULL THEN edited_at ELSE ? END,deleted_at=CASE WHEN ? IS NULL THEN ? ELSE NULL END WHERE id=? AND room_id=? AND actor_key=? AND deleted_at IS NULL AND EXISTS (SELECT 1 FROM ${joins} WHERE r.id=? AND (${gate.sql}) AND ${content} AND ${writable}) RETURNING ${messageColumns}`, body ?? "", body?.toLowerCase() ?? "", body, at, body, at, messageId, id, actor.key, id, ...gate.values),
        d1.prepare(`UPDATE chat_rooms SET last_message_preview=CASE WHEN msg.deleted_at IS NOT NULL THEN 'Message deleted' ELSE substr(COALESCE(NULLIF(msg.body,''),json_extract(msg.attachment,'$.name')),1,180) END,search_preview=CASE WHEN msg.deleted_at IS NOT NULL THEN 'message deleted' ELSE substr(COALESCE(NULLIF(msg.search_body,''),msg.search_attachment),1,180) END,updated_at=max(updated_at,?) FROM chat_messages msg WHERE chat_rooms.id=? AND msg.id=? AND changes()=1 AND msg.id=(SELECT id FROM chat_messages WHERE room_id=chat_rooms.id ORDER BY created_at DESC,id DESC LIMIT 1)`).bind(at, id, messageId),
      ]);
      const saved = result[0].results[0] as ChatMessage | undefined;
      if (!saved) return fail("Only your own available messages can be changed.", 403);
      return message(saved);
    },
    async getChatAttachment(actor, id, messageId) { const s = await session(actor), gate = s.access(actor); const saved = await s.query(`SELECT msg.attachment FROM ${joins} JOIN chat_messages msg ON msg.room_id=r.id WHERE msg.id=? AND r.id=? AND msg.deleted_at IS NULL AND msg.attachment IS NOT NULL AND (${gate.sql}) AND ${content}`, messageId, id, ...gate.values).first<{ attachment: string }>(); if (!saved) return fail("Attachment unavailable.", 404); return JSON.parse(saved.attachment) as ChatAttachment; },
    async markChatRead(actor, id, messageId) { const s = await session(actor), gate = s.access(actor); await s.query(`INSERT INTO chat_reads (room_id,actor_key,last_read_at,last_read_id) SELECT r.id,?,msg.created_at,msg.id FROM ${joins} JOIN chat_messages msg ON msg.room_id=r.id WHERE r.id=? AND msg.id=? AND (${gate.sql}) AND ${content} ON CONFLICT(room_id,actor_key) DO UPDATE SET last_read_at=excluded.last_read_at,last_read_id=excluded.last_read_id WHERE (chat_reads.last_read_at,COALESCE(chat_reads.last_read_id,'00000000-0000-0000-0000-000000000000'))<(excluded.last_read_at,excluded.last_read_id)`, actor.key, id, messageId, ...gate.values).run(); },
    async chatPeople(actor, search = "") { const s = await session(actor); if (!actor.admin) return fail("Administrator access required.", 403); const pattern = escapeSearch(search.toLowerCase()); const result = await d1.batch([s.query(`SELECT id,COALESCE(name,email) AS name,email FROM live_users WHERE active AND deleted_at IS NULL AND role='project_manager' ORDER BY name,id LIMIT 200`), s.query(`SELECT id,COALESCE(name,email) AS name,email FROM live_users WHERE active AND deleted_at IS NULL AND role NOT IN ('project_manager','customer_support') AND paid AND (?='' OR search_name LIKE ? ESCAPE '\\' OR search_email LIKE ? ESCAPE '\\') ORDER BY name,id LIMIT 30`, search, pattern, pattern)]); return { managers: result[0].results as ChatPerson[], clients: result[1].results as ChatPerson[] }; },
    async createChatRoomsForClient(actor, clientId) { const s = await session(actor); if (!actor.admin) return fail("Administrator access required.", 403); const client = s.current.users.find(user => user.id === clientId); if (!client?.active || client.deletedAt || !client.paid || ["project_manager", "customer_support"].includes(client.role)) return fail("Choose an active client with a paid purchase.", 400); await store.ensureClientChatRooms(actor); return (await d1.prepare(`SELECT id,kind FROM chat_rooms WHERE client_id=? AND kind='manager'`).bind(clientId).all<{ id: string }>()).results; },
    async assignChatManager(actor, id, managerId, expectedManagerId) {
      const s = await session(actor); if (!actor.admin) return fail("Administrator access required.", 403); await s.identities(); const at = new Date().toISOString(), noticeId = crypto.randomUUID();
      const manager = managerId ? s.current.users.find(user => user.id === managerId && user.role === "project_manager" && user.active && !user.deletedAt) : null;
      if (managerId && !manager) return fail("The assignment changed or this manager is unavailable. Refresh and try again.", 409);
      const body = manager ? `${chatSenderName("project_manager", manager.name)} joined the group as your project manager.` : "Your project manager left the group. Our admin team is here to help while a new manager is assigned.";
      const gate = s.access(actor), allowed = `r.id=? AND r.kind='manager' AND r.manager_id IS ? AND (${gate.sql}) AND c.active AND c.deleted_at IS NULL`;
      const result = await d1.batch([
        s.query(`INSERT INTO chat_messages (id,room_id,actor_key,sender_name,sender_role,body,client_nonce,created_at,search_body) SELECT ?,r.id,'system:assignment','Project activity','system',?,?,?,? FROM ${joins} WHERE ${allowed} AND r.manager_id IS NOT ?`, noticeId, body, noticeId, at, body.toLowerCase(), id, expectedManagerId, ...gate.values, managerId),
        s.query(`UPDATE chat_rooms SET manager_id=?,updated_at=CASE WHEN EXISTS(SELECT 1 FROM chat_messages WHERE id=?) THEN max(updated_at,?) ELSE updated_at END,last_message_at=CASE WHEN EXISTS(SELECT 1 FROM chat_messages WHERE id=?) THEN max(COALESCE(last_message_at,?),?) ELSE last_message_at END,last_message_preview=CASE WHEN EXISTS(SELECT 1 FROM chat_messages WHERE id=?) AND (last_message_at IS NULL OR last_message_at<=?) THEN ? ELSE last_message_preview END,search_preview=CASE WHEN EXISTS(SELECT 1 FROM chat_messages WHERE id=?) AND (last_message_at IS NULL OR last_message_at<=?) THEN ? ELSE search_preview END WHERE id IN (SELECT r.id FROM ${joins} WHERE ${allowed}) RETURNING id`, managerId, noticeId, at, noticeId, at, at, noticeId, at, preview(body), noticeId, at, preview(body).toLowerCase(), id, expectedManagerId, ...gate.values),
      ]);
      if (!result[1].results.length) fail("The assignment changed or this manager is unavailable. Refresh and try again.", 409);
    },
    async createSupportTicket(actor, id, subject, category, priority, body) {
      const roomId = id.toLowerCase();
      const s = await session(actor); if (chatIsStaff(actor)) return fail("Tickets are started by customers.", 403);
      const reference = await s.query("SELECT room_id AS roomId FROM chat_messages WHERE actor_key=? AND client_nonce=?", actor.key, roomId).first<{ roomId: string }>();
      if (reference && reference.roomId !== roomId) return fail("Message reference already used.", 409);
      await s.identities(); const at = new Date().toISOString(), messageId = crypto.randomUUID();
      await d1.batch([
        d1.prepare(`INSERT INTO chat_rooms (id,client_id,kind,last_message_at,last_message_preview,created_at,updated_at,search_preview) SELECT ?,?,'support',?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM chat_messages WHERE actor_key=? AND client_nonce=?) ON CONFLICT(id) DO NOTHING`).bind(roomId, actor.id, at, preview(body), at, at, preview(body).toLowerCase(), actor.key, roomId),
        d1.prepare(`INSERT INTO support_tickets (room_id,subject,category,priority,updated_at,search_subject) SELECT ?,?,?,?,?,? WHERE changes()=1`).bind(roomId, subject, category, priority, at, subject.toLowerCase()),
        d1.prepare(`INSERT INTO chat_messages (id,room_id,actor_key,sender_user_id,sender_name,sender_role,body,client_nonce,created_at,search_body) SELECT ?,?,?,?,?,?,?,?,?,? WHERE changes()=1`).bind(messageId, roomId, actor.key, actor.id, actor.name, actor.role, body, roomId, at, body.toLowerCase()),
      ]);
      const savedReference = await s.query("SELECT room_id AS roomId FROM chat_messages WHERE actor_key=? AND client_nonce=?", actor.key, roomId).first<{ roomId: string }>();
      if (savedReference && savedReference.roomId !== roomId) return fail("Message reference already used.", 409);
      const existing = await s.getRoom(actor, roomId), initial = await store.findChatMessageByNonce(actor, roomId, roomId);
      if (!existing.ticket || existing.ticket.subject !== subject || existing.ticket.category !== category || existing.ticket.priority !== priority || !initial || initial.body !== body) return fail("This ticket reference was already used. Refresh and try again.", 409);
      return existing;
    },
    async updateSupportTicket(actor, id, status, priority, expected) {
      const s = await session(actor), current = await s.getRoom(actor, id);
      if (!current.ticket) return fail("Choose a support ticket.", 400);
      if (!chatIsStaff(actor) && (status === "waiting_customer" || priority !== current.ticket.priority)) return fail("Only the support team can change priority or request a customer response.", 403);
      if (current.ticket.status === status && current.ticket.priority === priority) return current;
      const displayName = chatSenderName(actor.role, actor.name);
      const body = current.ticket.status !== status ? `${displayName} ${status === "closed" ? "closed this ticket." : current.ticket.status === "closed" ? "reopened this ticket." : status === "waiting_customer" ? "requested a customer response." : "sent this ticket back to support."}` : `${displayName} changed the priority to ${priority}.`;
      const at = new Date(Math.max(Date.now(), Date.parse(expected) + 1)).toISOString(), messageId = crypto.randomUUID(), gate = s.access(actor);
      const result = await d1.batch([
        s.query(`UPDATE support_tickets SET status=?,priority=?,updated_at=?,closed_at=?,closed_by=? WHERE room_id=? AND updated_at=? AND (?=1 OR (priority=? AND ((?='closed' AND status<>'closed') OR (?='waiting_support' AND status='closed')))) AND EXISTS(SELECT 1 FROM ${joins} WHERE r.id=? AND (${gate.sql}) AND c.active AND c.deleted_at IS NULL) RETURNING room_id`, status, priority, at, status === "closed" ? at : null, status === "closed" ? actor.key : null, id, expected, chatIsStaff(actor) ? 1 : 0, priority, status, status, id, ...gate.values),
        d1.prepare(`INSERT INTO chat_messages (id,room_id,actor_key,sender_name,sender_role,body,client_nonce,created_at,search_body) SELECT ?,?,'system:ticket','Ticket activity','system',?,?,?,? WHERE changes()=1`).bind(messageId, id, body, messageId, at, body.toLowerCase()),
        d1.prepare(`UPDATE chat_rooms SET updated_at=max(updated_at,?),last_message_at=max(COALESCE(last_message_at,?),?),last_message_preview=CASE WHEN last_message_at IS NULL OR last_message_at<=? THEN ? ELSE last_message_preview END,search_preview=CASE WHEN last_message_at IS NULL OR last_message_at<=? THEN ? ELSE search_preview END WHERE id=? AND EXISTS(SELECT 1 FROM chat_messages WHERE id=?)`).bind(at, at, at, at, preview(body), at, preview(body).toLowerCase(), id, messageId),
      ]);
      if (!result[0].results.length) return fail("This ticket changed. Refresh it before updating its status.", 409);
      return s.getRoom(actor, id);
    },
    async chatRecipients(id, previousManagerId) { const s = await session(); const rows = await s.query(`SELECT 'user:'||u.id AS key FROM live_users u JOIN chat_rooms r ON r.id=? WHERE u.active AND u.deleted_at IS NULL AND (u.id=r.client_id OR (r.kind='support' AND u.role='customer_support') OR (r.kind='manager' AND u.role='project_manager' AND (u.id=r.manager_id OR u.id=?))) UNION SELECT 'admin:'||id AS key FROM live_admins WHERE active AND role='admin'`, id, previousManagerId ?? null).all<{ key: string }>(); return rows.results.map(row => row.key); },
  };
  return store;
}
