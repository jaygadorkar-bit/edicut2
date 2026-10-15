// Exercise the actual HTTP routes against disposable fixtures only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import postgres from 'postgres';
const origin = 'http://localhost:3003';
const db = postgres('postgresql://postgres:chat-test-local-only@127.0.0.1:55439/edicut_chat_test', { onnotice: () => {} });
const cookies = JSON.parse(await fs.readFile(new URL('../.codex-tmp/chat-test-sessions.json', import.meta.url), 'utf8'));
const ids = { client: '10000000-0000-4000-8000-000000000001', other: '10000000-0000-4000-8000-000000000002' };
let checks = 0; const created = [], check = (condition, label) => { assert.ok(condition, label); checks++; };
async function api(actor, operation = 'rooms', values = {}, post) {
  const response = await fetch(`${origin}/api/chat?${new URLSearchParams({ scope: actor.startsWith('admin') ? 'admin' : 'client', operation, ...values })}`, { method: post ? 'POST' : 'GET', headers: { Cookie: cookies[actor] ?? '', Origin: origin }, body: post ? new URLSearchParams(post) : undefined });
  return { status: response.status, body: await response.json() };
}
const update = (actor, room, status, priority = room.ticket.priority, expected = room.ticket.updatedAt) => api(actor, '', {}, { intent: 'ticket-update', roomId: room.id, status, priority, expectedUpdatedAt: expected });
try {
  const project = (await api('client')).body.rooms[0], locked = (await api('otherClient')).body.rooms[0];
  check(project.projectUnlocked && !locked.projectUnlocked, 'Only a paid purchase unlocks project messaging');
  check(!(await api('admin')).body.rooms.some(r => r.clientId === ids.other), 'Unpaid customers stay out of the admin project inbox');
  check(!(await api('admin', 'people')).body.clients.some(c => c.id === ids.other), 'Admin cannot manually create an unpaid group');
  check((await api('admin', '', {}, { intent: 'create', clientId: ids.other })).status === 400, 'Server rejects bypassing the purchase gate');
  check((await api('otherClient', 'messages', { roomId: locked.id })).body.messages.length === 0, 'Locked groups do not disclose message content');
  check((await api('otherClient', '', {}, { intent: 'typing', roomId: locked.id })).status === 403, 'Locked groups cannot send typing events');
  const welcome = (await api('client', 'messages', { roomId: project.id })).body.messages.filter(m => m.actorKey === 'system:admin');
  await api('client');
  check(welcome.length === 1 && welcome[0].body.startsWith('A manager will be assigned to you shortly.'), 'An admin welcome is seeded exactly once');
  await api('admin', '', {}, { intent: 'assign', roomId: project.id, managerId: '', expectedManagerId: project.managerId });
  check((await api('client', '', {}, { intent: 'send', roomId: project.id, body: 'Hello admin, while I wait for my manager.', nonce: crypto.randomUUID() })).status === 200, 'Paid customers can speak before manager assignment');
  check((await api('admin', '', {}, { intent: 'send', roomId: project.id, body: 'Welcome! We are arranging your manager.', nonce: crypto.randomUUID() })).status === 200, 'Admins participate from the beginning');
  check((await api('manager', 'messages', { roomId: project.id })).status === 404, 'An unassigned manager cannot join early');
  const [managerIdentity] = await db`SELECT name, email FROM users WHERE id = ${project.managerId}`;
  await db`UPDATE users SET name = ${managerIdentity.email} WHERE id = ${project.managerId}`;
  try {
    await api('admin', '', {}, { intent: 'assign', roomId: project.id, managerId: project.managerId, expectedManagerId: '' });
    const assignmentHistory = await api('manager', 'messages', { roomId: project.id });
    const assignmentNotice = assignmentHistory.body.messages.findLast(message => message.actorKey === 'system:assignment');
    check(assignmentNotice?.body === 'Project manager joined the group as your project manager.' && !assignmentNotice.body.includes(managerIdentity.email), 'Assignment notices never expose a manager email when the profile name is missing');
    const managerReply = await api('manager', '', {}, { intent: 'send', roomId: project.id, body: 'Name privacy check', nonce: crypto.randomUUID() });
    check(managerReply.status === 200 && managerReply.body.message.senderName === 'Project manager' && !managerReply.body.message.senderName.includes(managerIdentity.email), 'Messages never expose a manager email when the profile name is missing');
  } finally {
    await db`UPDATE users SET name = ${managerIdentity.name} WHERE id = ${project.managerId}`;
  }
  check((await api('manager', 'messages', { roomId: project.id })).body.messages.some(m => m.body.includes('while I wait')), 'Assigned managers receive the existing group history');

  const nonce = crypto.randomUUID(), input = { intent: 'ticket-create', nonce, subject: 'Upload issue at 10%', category: 'technical', priority: 'high', body: 'The upload stops at 10%. Please help me.' };
  const [otherIdentity] = await db`SELECT name, email FROM users WHERE id = ${ids.other}`;
  await db`UPDATE users SET name = ${otherIdentity.email} WHERE id = ${ids.other}`;
  let opened;
  try { opened = await api('otherClient', '', {}, input); }
  finally { await db`UPDATE users SET name = ${otherIdentity.name} WHERE id = ${ids.other}`; }
  check(opened.status === 200, 'Unpaid customers can start support tickets');
  check(opened.body.room.clientName === 'Client' && opened.body.room.clientEmail === null, 'Ticket room metadata does not disclose an email-shaped customer name');
  let ticket = opened.body.room; created.push(ticket.id);
  check(ticket.ticket.category === 'technical' && ticket.ticket.priority === 'high' && ticket.ticket.status === 'waiting_support', 'Issue type, priority, and initial state persist');
  check((await api('otherClient', '', {}, input)).body.room.id === ticket.id, 'Retrying a ticket submission does not duplicate it');
  check((await api('otherClient', '', {}, { ...input, body: 'Changed request using the same reference' })).status === 409, 'A ticket reference cannot be reused with a different description');
  check((await api('otherClient', '', {}, { ...input, priority: 'normal' })).status === 409, 'A ticket reference cannot be reused with a different priority');
  check((await api('otherClient', 'messages', { roomId: ticket.id })).body.messages.length === 1, 'Ticket description is stored once');
  check((await api('client', 'messages', { roomId: ticket.id })).status === 404, 'Other customers cannot read tickets');
  check((await api('manager', 'messages', { roomId: ticket.id })).status === 404, 'Managers cannot read the support queue');
  const supportHistory = await api('support', 'messages', { roomId: ticket.id }), adminHistory = await api('admin', 'messages', { roomId: ticket.id });
  check(supportHistory.status === 200 && adminHistory.status === 200, 'Support staff and admins can respond from the start');
  check(supportHistory.body.room.clientEmail === null, 'Support staff chat responses omit client email addresses');
  check(adminHistory.body.room.clientEmail === 'chat-fixture-1@example.test', 'Admins retain ticket email access for account support');
  check((await api('otherClient', '', {}, { ...input, nonce: crypto.randomUUID(), category: '__proto__' })).status === 400, 'Invalid issue categories are rejected');
  const second = await api('otherClient', '', {}, { ...input, nonce: crypto.randomUUID(), subject: 'Second account issue', category: 'account' });
  check(second.status === 200 && second.body.room.id !== ticket.id, 'A customer can have multiple independent tickets'); created.push(second.body.room.id);
  const searched = (await api('admin', 'rooms', { view: 'tickets', search: '10%' })).body.rooms;
  check(searched.length > 0 && searched.every(r => r.ticket.subject.includes('10%') || r.lastMessagePreview.includes('10%')), 'Ticket search escapes literal percent characters');
  const futureVersion = '2099-01-01T00:00:00.000Z';
  await db`UPDATE support_tickets SET updated_at = ${futureVersion} WHERE room_id = ${ticket.id}`;
  const replied = await api('admin', '', {}, { intent: 'send', roomId: ticket.id, body: 'Please try a smaller file.', nonce: crypto.randomUUID() });
  check(replied.status === 200, 'Admin replies are saved');
  ticket = (await api('otherClient', 'messages', { roomId: ticket.id })).body.room;
  check(Date.parse(ticket.ticket.updatedAt) > Date.parse(futureVersion), 'A ticket reply advances its compare-and-set version strictly');
  check(ticket.ticket.status === 'waiting_customer', 'Staff replies mark tickets awaiting the customer');
  await api('otherClient', '', {}, { intent: 'send', roomId: ticket.id, body: 'That still does not work.', nonce: crypto.randomUUID() });
  ticket = (await api('admin', 'messages', { roomId: ticket.id })).body.room;
  check(ticket.ticket.status === 'waiting_support', 'Customer replies put the ticket back in the support queue');
  check((await update('otherClient', ticket, 'waiting_customer')).status === 403, 'Customers cannot request a customer response');
  check((await update('otherClient', ticket, ticket.ticket.status, 'low')).status === 403, 'Only staff can change priority after creation');
  const previousTimestamp = ticket.ticket.updatedAt;
  const prioritized = await update('support', ticket, 'waiting_support', 'normal'); check(prioritized.status === 200, 'Support staff can prioritize tickets'); ticket = prioritized.body.room;
  const adminReply = await api('admin2', '', {}, { intent: 'ticket-update', roomId: ticket.id, status: 'waiting_customer', priority: 'normal', expectedUpdatedAt: ticket.ticket.updatedAt });
  check(adminReply.status === 200, 'A second administrator can update the ticket');
  const adminActivity = (await api('otherClient', 'messages', { roomId: ticket.id })).body.messages.findLast(m => m.senderRole === 'system' && m.body.includes('requested a customer response'));
  check(adminActivity?.body === 'EdiCut Admin requested a customer response.', 'Admin ticket activity never exposes a personal account name');
  ticket = adminReply.body.room;
  check((await update('admin', ticket, 'closed', 'normal', previousTimestamp)).status === 409, 'Stale ticket changes are rejected');
  const closed = await update('admin', ticket, 'closed'); check(closed.status === 200 && closed.body.room.ticket.closedAt, 'Admin can close a ticket with a recorded timestamp'); ticket = closed.body.room;
  check((await api('otherClient', 'messages', { roomId: ticket.id })).status === 200, 'Closed ticket history remains accessible');
  check((await api('otherClient', '', {}, { intent: 'send', roomId: ticket.id, body: 'Cannot send when closed', nonce: crypto.randomUUID() })).status === 403, 'Closed tickets reject replies on the server');
  check((await api('admin', 'rooms', { view: 'tickets', filter: 'closed' })).body.rooms.some(r => r.id === ticket.id), 'Closed tickets can be filtered');
  const reopened = await update('otherClient', ticket, 'waiting_support'); check(reopened.status === 200 && !reopened.body.room.ticket.closedAt, 'Customers can reopen their own ticket'); ticket = reopened.body.room;
  check((await api('otherClient', '', {}, { intent: 'send', roomId: ticket.id, body: 'Thanks, I have a follow-up.', nonce: crypto.randomUUID() })).status === 200, 'Reopened tickets accept new replies');
  const activity = (await api('otherClient', 'messages', { roomId: ticket.id })).body.messages.filter(m => m.senderRole === 'system');
  check(activity.some(m => m.body.includes('closed')) && activity.some(m => m.body.includes('reopened')), 'Lifecycle activity appears in the saved thread');

  ticket = (await api('admin', 'messages', { roomId: ticket.id })).body.room;
  const racingReply = 'A reply submitted while staff closes the ticket.';
  const [racingClose, racingSend] = await Promise.all([update('admin', ticket, 'closed'), api('otherClient', '', {}, { intent: 'send', roomId: ticket.id, body: racingReply, nonce: crypto.randomUUID() })]);
  check([200, 409].includes(racingClose.status) && [200, 403].includes(racingSend.status), 'Concurrent close and reply return safe, recoverable results');
  const raced = (await api('admin', 'messages', { roomId: ticket.id })).body;
  if (racingClose.status === 200) {
    const closingActivity = raced.messages.findLast(m => m.senderRole === 'system' && m.body.includes('closed'));
    check(!raced.messages.some(m => m.body === racingReply && m.createdAt > closingActivity.createdAt), 'A successful close cannot be followed by a concurrent saved reply');
  } else {
    check(raced.room.ticket.status === 'waiting_support' && racingSend.status === 200, 'A newer reply prevents a stale close from hiding the request');
  }

  await db`UPDATE customer_subscriptions SET status = 'unpaid', paid_at = NULL, paid_by = NULL WHERE owner_id = ${ids.client}`;
  check((await api('client', 'messages', { roomId: project.id })).body.messages.length === 0 && (await api('manager', 'messages', { roomId: project.id })).status === 404, 'Revoking the paid purchase removes project history access immediately');
  await db`UPDATE customer_subscriptions SET status = 'paid', paid_at = now(), paid_by = '20000000-0000-4000-8000-000000000001' WHERE owner_id = ${ids.client}`;

  const paging = await db`WITH rooms AS (INSERT INTO chat_rooms (client_id, kind) SELECT ${ids.other}, 'support' FROM generate_series(1, 44) RETURNING id), tickets AS (INSERT INTO support_tickets (room_id, subject, category) SELECT id, 'Paging verification ticket', 'other' FROM rooms RETURNING room_id) SELECT room_id AS id FROM tickets`; created.push(...paging.map(r => r.id));
  const first = (await api('otherClient', 'rooms', { view: 'tickets' })).body, next = (await api('otherClient', 'rooms', { view: 'tickets', page: '2' })).body;
  check(first.rooms.length === 40 && first.hasMore && !next.hasMore, 'The ticket queue paginates beyond 40 tickets');
  check(new Set([...first.rooms, ...next.rooms].map(r => r.id)).size === first.ticketCounts.all, 'Ticket pagination has no missing or duplicate rows');
  await db.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='ticket_test_reader') THEN CREATE ROLE ticket_test_reader; END IF; END $$; GRANT USAGE ON SCHEMA public TO ticket_test_reader; GRANT SELECT ON support_tickets TO ticket_test_reader");
  await db.begin(async tx => { await tx.unsafe('SET LOCAL ROLE ticket_test_reader'); check(Number((await tx`SELECT count(*) FROM support_tickets`)[0].count) === 0, 'RLS blocks direct ticket-table access'); });
  console.log(`${checks} isolated project-group and ticket checks passed: payment gates, admin welcome, pre-assignment replies, multiple tickets, roles, statuses, priority, retries, search, pagination, and RLS.`);
} finally {
  if (created.length) await db`DELETE FROM chat_rooms WHERE id IN ${db(created)}`;
  await db`UPDATE chat_rooms SET manager_id = '10000000-0000-4000-8000-000000000003' WHERE client_id = ${ids.client} AND kind = 'manager'`;
  await db`UPDATE customer_subscriptions SET status = 'paid', paid_at = now(), paid_by = '20000000-0000-4000-8000-000000000001' WHERE owner_id = ${ids.client}`;
  await db.end();
}
