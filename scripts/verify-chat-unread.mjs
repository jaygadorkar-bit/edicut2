// All writes target disposable fixtures on port 55439; never use the live app.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import postgres from 'postgres';
const origin = 'http://localhost:3003';
const db = postgres('postgresql://postgres:chat-test-local-only@127.0.0.1:55439/edicut_chat_test');
const cookies = JSON.parse(await fs.readFile(new URL('../.codex-tmp/chat-test-sessions.json', import.meta.url), 'utf8'));
let checks = 0;
const created = [], check = (condition, label) => { assert.ok(condition, label); checks++; };
async function api(actor, operation = 'rooms', values = {}, post) {
  const response = await fetch(`${origin}/api/chat?${new URLSearchParams({ scope: actor.startsWith('admin') ? 'admin' : 'client', operation, ...values })}`, {
    method: post ? 'POST' : 'GET', headers: { Cookie: cookies[actor] ?? '', Origin: origin }, body: post ? new URLSearchParams(post) : undefined,
  });
  return { status: response.status, body: await response.json() };
}
const counts = async actor => { const result = await api(actor, 'unread'); assert.equal(result.status, 200); return result.body; };
const manager = '10000000-0000-4000-8000-000000000003', replacement = '10000000-0000-4000-8000-000000000004';
try {
  check((await api('anonymous', 'unread')).status === 401, 'Unread counts require authentication');
  const room = (await api('client')).body.rooms[0];
  const adminParticipants = room.participants?.filter(member => member.role === 'admin') ?? [];
  check(adminParticipants.length === 1 && adminParticipants[0].key === 'admin:team' && adminParticipants[0].name === 'EdiCut Admin' && !room.participants.some(member => member.key === `user:10000000-0000-4000-8000-000000000001`), 'Client group previews show one EdiCut Admin team entry and omit the current client');
  const teammateReplies = await Promise.all(['admin2', 'admin3'].map((actor, index) => api(actor, '', {}, {
    intent: 'send', roomId: room.id, body: `Admin teammate ${index + 2} can reply.`, nonce: crypto.randomUUID(),
  })));
  check(teammateReplies.every((reply, index) => reply.status === 200 && reply.body.message.actorKey === `admin:20000000-0000-4000-8000-${String(index + 2).padStart(12, '0')}` && reply.body.message.senderName === 'EdiCut Admin'), 'Separate admin accounts can send as EdiCut Admin in the same project group');
  await api('admin2', '', {}, { intent: 'read', roomId: room.id, messageId: teammateReplies[1].body.message.id });
  const teamAfterReplies = (await api('client')).body.rooms.find(r => r.id === room.id).participants.find(member => member.key === 'admin:team');
  const adminHistory = (await api('client', 'messages', { roomId: room.id })).body.messages;
  const adminReceipts = (await api('client', 'messages', { roomId: room.id })).body.receipts;
  check(Boolean(teamAfterReplies?.lastActiveAt) && adminHistory.some(m => m.body === 'Admin teammate 2 can reply.' && m.senderName === 'EdiCut Admin') && adminReceipts.some(r => r.actorKey === 'admin:20000000-0000-4000-8000-000000000002' && r.name === 'EdiCut Admin'), 'Historical admin messages and read receipts display as EdiCut Admin');
  const lockedRoom = (await api('otherClient')).body.rooms[0];
  check(lockedRoom && !lockedRoom.projectUnlocked && lockedRoom.participants?.length === 0, 'Locked project rooms do not expose participant details');
  const assign = (next, expected) => api('admin', '', {}, { intent: 'assign', roomId: room.id, managerId: next ?? '', expectedManagerId: expected ?? '' });
  const activity = async () => (await api('client', 'messages', { roomId: room.id })).body.messages.filter(m => m.actorKey === 'system:assignment');
  const before = (await activity()).length;
  check((await assign(replacement, manager)).status === 200, 'A manager can be reassigned');
  let notices = await activity();
  check(notices.length === before + 1 && notices.at(-1).body === 'Owen Reed joined the group as your project manager.', 'Manager name and role persist in chat activity');
  const participantsAfterAssignment = (await api('client')).body.rooms.find(r => r.id === room.id).participants;
  check(participantsAfterAssignment.some(member => member.role === 'project_manager' && member.name === 'Owen Reed') && !participantsAfterAssignment.some(member => member.key === `user:${manager}`), 'Group participant rows follow the current manager assignment');
  check((await api('manager', 'messages', { roomId: room.id })).status === 404 && (await counts('manager')).projects === 0, 'Former managers lose history access and unread counts');
  check((await counts('otherManager')).projects > 0, 'The assigned manager receives unread group messages');
  check((await assign(replacement, replacement)).status === 200 && (await activity()).length === notices.length, 'Saving an unchanged assignment does not duplicate activity');
  check((await assign(manager, manager)).status === 409 && (await activity()).length === notices.length, 'A stale assignment cannot add a misleading activity message');
  check((await assign('10000000-0000-4000-8000-000000000002', replacement)).status === 409 && (await activity()).length === notices.length, 'Invalid manager roles cannot change the group or its history');
  const race = await Promise.all([assign(manager, replacement), assign(manager, replacement)]);
  check(race.map(r => r.status).sort().join(',') === '200,409' && (await activity()).length === notices.length + 1, 'Concurrent assignment produces one saved notice');
  const baseline = await counts('client');
  const sentMessage = await api('client', '', {}, { intent: 'send', roomId: room.id, body: 'Unread count excludes my own message.', nonce: crypto.randomUUID() });
  check(sentMessage.status === 200 && (await counts('client')).projects === baseline.projects, 'Your own messages do not increase your unread count');
  const sentRoom = (await api('client')).body.rooms.find(r => r.id === room.id);
  check(sentRoom.lastMessageActorKey === `user:10000000-0000-4000-8000-000000000001` && !sentRoom.lastMessageRead, 'The room preview marks your latest message as sent');
  await api('manager', '', {}, { intent: 'read', roomId: room.id, messageId: sentMessage.body.message.id });
  const readRoom = (await api('client')).body.rooms.find(r => r.id === room.id);
  check(readRoom.lastMessageRead, 'The room preview shows a participant read the latest message');
  check(Boolean(readRoom.participants.find(member => member.key === `user:${manager}`)?.lastActiveAt), 'The group shows its manager read activity');
  const history = (await api('client', 'messages', { roomId: room.id })).body.messages;
  await api('client', '', {}, { intent: 'read', roomId: room.id, messageId: history.at(-1).id });
  check((await counts('client')).projects === 0, 'Reading the latest project message clears the badge');
  const beforeTickets = await counts('otherClient'), beforeAdmin = await counts('admin');
  const rooms = await db`WITH rooms AS (INSERT INTO chat_rooms (client_id, kind) SELECT '10000000-0000-4000-8000-000000000002', 'support' FROM generate_series(1, 42) RETURNING id),
    tickets AS (INSERT INTO support_tickets (room_id, subject, category) SELECT id, 'Unread pagination check', 'account' FROM rooms RETURNING room_id)
    SELECT room_id AS id FROM tickets`;
  created.push(...rooms.map(r => r.id));
  for (const r of rooms) await db`INSERT INTO chat_messages (room_id, actor_key, sender_name, sender_role, body, client_nonce)
    VALUES (${r.id}, 'system:verification', 'Test activity', 'system', 'An unread ticket update.', ${crypto.randomUUID()})`;
  check((await api('otherClient', 'rooms', { view: 'tickets' })).body.hasMore && (await counts('otherClient')).tickets === beforeTickets.tickets + 42,
    'Ticket badge includes unread messages beyond the first 40 conversations');
  check((await counts('admin')).tickets === beforeAdmin.tickets + 42 && (await counts('manager')).tickets === 0, 'Admin counts span the whole queue; manager counts exclude tickets');
  check((await counts('client')).tickets === baseline.tickets, 'Another customer’s tickets do not leak into your unread count');
  const tiedRoom = rooms[0].id, at = new Date('2026-10-09T12:00:00Z');
  await db`DELETE FROM chat_messages WHERE room_id = ${tiedRoom}`;
  for (let i = 1; i <= 3; i++) await db`INSERT INTO chat_messages (id, room_id, actor_key, sender_name, sender_role, body, client_nonce, created_at)
    VALUES (${`50000000-0000-4000-8000-${String(i).padStart(12, '0')}`}, ${tiedRoom}, 'system:verification', 'Test activity', 'system', 'Same timestamp update.', ${crypto.randomUUID()}, ${at})`;
  await api('otherClient', '', {}, { intent: 'read', roomId: tiedRoom, messageId: '50000000-0000-4000-8000-000000000002' });
  check((await counts('otherClient')).tickets === beforeTickets.tickets + 42, 'Read cursors distinguish messages with identical timestamps');
  await api('otherClient', '', {}, { intent: 'read', roomId: tiedRoom, messageId: '50000000-0000-4000-8000-000000000003' });
  check((await counts('otherClient')).tickets === beforeTickets.tickets + 41, 'Reading the last tied message removes that room’s badge');
  await api('otherClient', '', {}, { intent: 'read', roomId: tiedRoom, messageId: '50000000-0000-4000-8000-000000000001' });
  check((await counts('otherClient')).tickets === beforeTickets.tickets + 41, 'An older read receipt cannot restore already-read messages');
  await db`UPDATE customer_subscriptions SET status = 'unpaid', paid_at = NULL, paid_by = NULL WHERE owner_id = '10000000-0000-4000-8000-000000000001'`;
  check((await counts('admin')).projects === 0 && (await counts('client')).projects === 0 && (await counts('manager')).projects === 0,
    'Revoked purchases immediately remove project unread counts');
  console.log(`${checks} isolated assignment and unread checks passed.`);
} finally {
  if (created.length) await db`DELETE FROM chat_rooms WHERE id IN ${db(created)}`;
  await db`UPDATE customer_subscriptions SET status = 'paid', paid_at = now(), paid_by = '20000000-0000-4000-8000-000000000001' WHERE owner_id = '10000000-0000-4000-8000-000000000001'`;
  await db`UPDATE chat_rooms SET manager_id = ${manager} WHERE client_id = '10000000-0000-4000-8000-000000000001' AND kind = 'manager'`;
  await db.end();
}
