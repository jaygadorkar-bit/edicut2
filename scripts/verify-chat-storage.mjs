import assert from "node:assert/strict";
import fs from "node:fs/promises";
import postgres from "postgres";
const db = postgres("postgresql://postgres:chat-test-local-only@127.0.0.1:55439/edicut_chat_test", { onnotice:() => {} });
const cookies = JSON.parse(await fs.readFile(new URL("../.codex-tmp/chat-test-sessions.json", import.meta.url), "utf8"));
const origin = "http://localhost:3003";
let checks=0; const check=(value,label)=>{assert.ok(value,label); checks++;};
async function api(actor, operation, values={}, post) { const response=await fetch(`${origin}/api/chat?${new URLSearchParams({scope:actor==="admin"?"admin":"client",operation,...values})}`,{method:post?"POST":"GET",headers:{Cookie:cookies[actor],Origin:origin},body:post?new URLSearchParams(post):undefined}); return {status:response.status,body:await response.json()}; }
const ids={client:"10000000-0000-4000-8000-000000000001",other:"10000000-0000-4000-8000-000000000002",support:"10000000-0000-4000-8000-000000000005"};
const created=[];
try {
  const rooms=(await api("otherClient","rooms")).body.rooms, room=rooms.find(r=>r.kind==="support");
  const at=new Date(Date.now()-86400000);
  for(let i=0;i<61;i++){ const id=crypto.randomUUID(); created.push(id); await db`INSERT INTO chat_messages (id,room_id,actor_key,sender_user_id,sender_name,sender_role,body,client_nonce,created_at) VALUES (${id},${room.id},${`user:${ids.support}`},${ids.support},'Sofia Patel','customer_support',${`History item ${i} literal 10%`},${crypto.randomUUID()},${new Date(at.getTime()+i*1000)})`; }
  const latest=(await api("otherClient","messages",{roomId:room.id})).body, first=latest.messages[0];
  check(latest.messages.length===50 && latest.hasOlder,"History is bounded to 50 messages");
  const older=(await api("otherClient","messages",{roomId:room.id,beforeAt:first.createdAt,beforeId:first.id})).body;
  const count=Number((await db`SELECT count(*) FROM chat_messages WHERE room_id=${room.id}`)[0].count);
  check(new Set([...latest.messages,...older.messages].map(m=>m.id)).size===count,"Cursor pagination has no missing or repeated messages");
  check((await api("otherClient","messages",{roomId:room.id,search:"10%"})).body.messages.every(m=>m.body.includes("10%")),"Wildcard characters in searches stay literal");
  const tieAt=new Date(Date.now()+2500), tieIds=["30000000-0000-4000-8000-000000000001","30000000-0000-4000-8000-000000000002"];
  for(const id of tieIds){created.push(id); await db`INSERT INTO chat_messages (id,room_id,actor_key,sender_user_id,sender_name,sender_role,body,client_nonce,created_at) VALUES (${id},${room.id},${`user:${ids.support}`},${ids.support},'Sofia Patel','customer_support','Same millisecond',${crypto.randomUUID()},${tieAt})`;}
  await api("otherClient","",{}, {intent:"read",roomId:room.id,messageId:tieIds[0]});
  check((await api("otherClient","rooms")).body.rooms.find(r=>r.id===room.id).unreadCount===1,"Reading one simultaneous message does not mark the other read");
  await api("otherClient","",{}, {intent:"read",roomId:room.id,messageId:tieIds[1]}); await api("otherClient","",{}, {intent:"read",roomId:room.id,messageId:tieIds[0]});
  check((await api("otherClient","rooms")).body.rooms.find(r=>r.id===room.id).unreadCount===0,"Read cursor never moves backwards");
  const nonce=crypto.randomUUID(); const posts=await Promise.all([api("client","",{}, {intent:"send",roomId:(await api("client","rooms")).body.rooms.find(r=>r.kind==="manager").id,body:"Concurrent retry",nonce}),api("client","",{}, {intent:"send",roomId:(await api("client","rooms")).body.rooms.find(r=>r.kind==="manager").id,body:"Concurrent retry",nonce})]);
  check(posts.every(p=>p.status===200) && posts[0].body.message.id===posts[1].body.message.id,"Concurrent identical sends resolve to one saved message"); created.push(posts[0].body.message.id);
  await db`UPDATE users SET active=false WHERE id=${ids.other}`;
  check((await api("otherClient","messages",{roomId:room.id})).status===401,"Inactive accounts lose chat access");
  await db`UPDATE users SET active=true WHERE id=${ids.other}`;
  await db`UPDATE users SET role='customer' WHERE id=${ids.support}`;
  check((await api("support","messages",{roomId:room.id})).status===404,"A removed support role loses access immediately");
  await db`UPDATE users SET role='customer_support' WHERE id=${ids.support}`;
  await db.unsafe("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='chat_test_reader') THEN CREATE ROLE chat_test_reader; END IF; END $$; GRANT USAGE ON SCHEMA public TO chat_test_reader; GRANT SELECT ON chat_rooms, chat_messages, chat_reads TO chat_test_reader");
  await db.begin(async tx=>{await tx.unsafe("SET LOCAL ROLE chat_test_reader"); check(Number((await tx`SELECT count(*) FROM chat_messages`)[0].count)===0,"RLS blocks direct table reads without a policy");});
  console.log(`${checks} isolated storage checks passed: history, search escaping, timestamp ties, concurrency, deactivation, role changes, and RLS.`);
} finally {
  await db`UPDATE users SET active=true WHERE id=${ids.other}`; await db`UPDATE users SET role='customer_support' WHERE id=${ids.support}`;
  if(created.length) await db`DELETE FROM chat_messages WHERE id IN ${db(created)}`;
  await db`UPDATE chat_rooms r SET last_message_at=(SELECT created_at FROM chat_messages WHERE room_id=r.id ORDER BY created_at DESC,id DESC LIMIT 1), last_message_preview=(SELECT CASE WHEN deleted_at IS NOT NULL THEN 'Message deleted' ELSE left(COALESCE(NULLIF(body,''),attachment->>'name'),180) END FROM chat_messages WHERE room_id=r.id ORDER BY created_at DESC,id DESC LIMIT 1) WHERE client_id IN ${db([ids.client,ids.other])}`;
  await db.end();
}
