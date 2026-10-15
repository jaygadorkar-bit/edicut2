// Actual API handlers + authoritative disposable PostgreSQL + local D1.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import postgres from "postgres";
import { loader, action } from "../apps/web/app/routes/api-chat";
const database="postgresql://postgres:chat-test-local-only@127.0.0.1:55439/edicut_chat_test";
process.env.DATABASE_URL=database;
process.env.SESSION_SECRET="chat-test-session-local-only";
const pg=postgres(database,{onnotice:()=>{}}),web=createRequire(new URL("../apps/web/package.json",import.meta.url)),runtime=createRequire(web.resolve("wrangler"));
const {Miniflare,convertV4MiniflareOptions}=runtime("miniflare");
const app=new Miniflare(convertV4MiniflareOptions({name:"chat-d1-api-verification",modules:true,compatibilityDate:"2026-04-19",script:"export default {fetch(){return new Response('Test only',{status:404});}};",d1Databases:{CHAT_D1:"chat-d1-api-verification"}}));
const cookies=JSON.parse(await fs.readFile(new URL("../.codex-tmp/chat-test-sessions.json",import.meta.url),"utf8")),origin="http://localhost:3003";
let cloudUploadAttempts=0;
const env:Record<string,unknown>={DATABASE_URL:database,SESSION_SECRET:process.env.SESSION_SECRET,APP_URL:origin,CHAT_BACKEND:"d1",CLOUDINARY_UPLOAD_LIMITER:{limit:async()=>{cloudUploadAttempts++;return {success:false};}}};
const context={cf:{env,ctx:{waitUntil:()=>{}}}};
let checks=0;const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function api(who:string,operation="rooms",values:Record<string,string>={},post?:Record<string,string>){const request=new Request(`${origin}/api/chat?${new URLSearchParams({scope:who.startsWith("admin")?"admin":"client",operation,...values})}`,{method:post?"POST":"GET",headers:{Cookie:cookies[who]??"",Origin:origin},body:post?new URLSearchParams(post):undefined});const response=await (post?action:loader)({request,context,params:{}} as never);check(response.headers.get("Cache-Control")==="no-store","D1 API replies are private");return {status:response.status,body:await response.json()};}
async function attachmentRetry(who:string,roomId:string,body:string,nonce:string){const form=new FormData();form.set("intent","send");form.set("roomId",roomId);form.set("body",body);form.set("nonce",nonce);form.set("file",new Blob([Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0])],{type:"image/png"}),"reference.png");const request=new Request(`${origin}/api/chat?scope=${who.startsWith("admin")?"admin":"client"}`,{method:"POST",headers:{Cookie:cookies[who]??"",Origin:origin},body:form});const response=await action({request,context,params:{}} as never);return {status:response.status,body:await response.json()};}
try {
  const d1=await app.getD1Database("CHAT_D1") as D1Database;env.CHAT_D1=d1;
  const schema=(await Promise.all(["0001_chat.sql","0002_chat_search.sql","0003_chat_room_search.sql"].map(name=>fs.readFile(new URL(`../packages/db/d1/chat/${name}`,import.meta.url),"utf8")))).join("\n").split("\n").filter(line=>!line.trim().startsWith("--")).join(" ").split(";").filter(sql=>sql.trim());
  await d1.batch(schema.map(sql=>d1.prepare(sql)));
  check((await api("anonymous")).status===401,"D1 API requires authentication");
  const group=(await api("client")).body.rooms[0];check(group.projectUnlocked,"Authoritative paid customer is unlocked");check(group.clientEmail===null,"D1 client chat payload omits the client's email");
  check((await api("client","messages",{roomId:group.id.toUpperCase()})).status===200,"D1 API canonicalizes uppercase room IDs");
  const locked=(await api("otherClient")).body.rooms[0];check(!locked.projectUnlocked,"Authoritative unpaid customer is locked");
  check((await api("otherClient","messages",{roomId:group.id})).status===404,"D1 API isolates customers");
  const nonce=crypto.randomUUID(),sent=await api("client","",{},{intent:"send",roomId:group.id,body:"API D1 hello",nonce});check(sent.status===200,"Real API saves to D1");
  check((await api("client","",{},{intent:"send",roomId:group.id,body:"API D1 hello",nonce})).body.message.id===sent.body.message.id,"D1 API retry returns the saved message");
  check((await api("client","",{},{intent:"send",roomId:group.id.toUpperCase(),body:"API D1 hello",nonce:nonce.toUpperCase()})).body.message.id===sent.body.message.id,"D1 API treats UUID casing consistently for room and message retries");
  check((await attachmentRetry("client",group.id,"Upload limit",crypto.randomUUID())).status===429 && cloudUploadAttempts===1,"D1 API enforces the dedicated attachment upload limit before Cloudinary");
  const clientTicket=(await api("client","",{},{intent:"ticket-create",nonce:crypto.randomUUID(),subject:"Cross-room retry ticket",category:"technical",priority:"normal",body:"Create the second authorized room"})).body.room;
  const collisionTicket=await api("client","",{},{intent:"ticket-create",nonce,subject:"Nonce collision",category:"other",priority:"normal",body:"Create no ticket"});
  check(collisionTicket.status===409 && Number(await d1.prepare("SELECT count(*) AS count FROM chat_rooms WHERE id=?").bind(nonce).first("count"))===0,"D1 API rejects a message nonce reused as a ticket ID without leaving an empty ticket");
  check((await api("client","",{},{intent:"send",roomId:clientTicket.id,body:"Cross-room nonce reuse",nonce})).status===409,"D1 API rejects a nonce already used in another authorized room");
  check((await attachmentRetry("client",group.id,"API D1 hello",nonce)).status===409 && cloudUploadAttempts===1,"D1 API rejects a retry that adds an attachment without consuming upload capacity");
  const raceNonce=crypto.randomUUID(),race=await Promise.all(Array.from({length:4},()=>api("client","",{},{intent:"send",roomId:group.id,body:"D1 concurrent retry",nonce:raceNonce})));
  check(race.every(result=>result.status===200&&result.body.message.id===race[0].body.message.id),"D1 concurrent retries resolve to one saved message");
  const racedHistory=await api("client","messages",{roomId:group.id});
  check(racedHistory.body.messages.filter((item:{clientNonce:string})=>item.clientNonce===raceNonce).length===1,"D1 concurrent retries never duplicate messages");
  check((await api("admin")).body.rooms[0].clientEmail==="chat-fixture-0@example.test","D1 admin payload keeps account email access");
  const managerId="10000000-0000-4000-8000-000000000003",[managerIdentity]=await pg`SELECT name,email FROM users WHERE id=${managerId}`;
  await pg`UPDATE users SET name=NULL WHERE id=${managerId}`;
  try {
    check((await api("admin","",{},{intent:"assign",roomId:group.id,managerId:managerId.toUpperCase(),expectedManagerId:""})).status===200,"D1 API canonicalizes manager IDs during assignment");
    const assignmentHistory=(await api("manager","messages",{roomId:group.id})).body.messages as {actorKey:string;body:string}[];
    const assignmentNotice=assignmentHistory.findLast(item=>item.actorKey==="system:assignment");
    check(assignmentNotice?.body==="Project manager joined the group as your project manager."&&!assignmentNotice.body.includes(managerIdentity.email),"D1 assignment notices never expose a manager email when the profile name is missing");
    const managerReply=await api("manager","",{},{intent:"send",roomId:group.id,body:"Name privacy check",nonce:crypto.randomUUID()});
    check(managerReply.status===200&&managerReply.body.message.senderName==="Project manager"&&!managerReply.body.message.senderName.includes(managerIdentity.email),"D1 messages never expose a manager email when the profile name is missing");
  } finally { await pg`UPDATE users SET name=${managerIdentity.name} WHERE id=${managerId}`; }
  const sync=await api("client","sync",{roomId:group.id,messageSearch:"API D1"});check(sync.body.history.messages.length===1 && sync.body.state.ready,"D1 sync returns room/history/badges");
  const ticketId=crypto.randomUUID(),[otherIdentity]=await pg`SELECT name,email FROM users WHERE id='10000000-0000-4000-8000-000000000002'`;
  await pg`UPDATE users SET name=${otherIdentity.email} WHERE id='10000000-0000-4000-8000-000000000002'`;
  let ticket;try { ticket=(await api("otherClient","",{},{intent:"ticket-create",nonce:ticketId,subject:"API ticket",category:"technical",priority:"normal",body:"Please help"})).body.room; }
  finally { await pg`UPDATE users SET name=${otherIdentity.name} WHERE id='10000000-0000-4000-8000-000000000002'`; }
  check(ticket.clientName==="Client"&&ticket.clientEmail===null,"D1 ticket metadata does not disclose an email-shaped customer name");
  check(ticket.ticket.status==="waiting_support","D1 ticket creation works through the real API");
  check((await api("otherClient","",{},{intent:"ticket-create",nonce:ticketId.toUpperCase(),subject:"API ticket",category:"technical",priority:"normal",body:"Please help"})).body.room.id===ticket.id,"D1 API treats UUID casing consistently for ticket retries");
  check((await api("otherClient","",{},{intent:"ticket-create",nonce:ticketId,subject:"API ticket",category:"technical",priority:"high",body:"Please help"})).status===409,"D1 ticket retry rejects a changed priority");
  check((await api("support","messages",{roomId:ticket.id})).body.room.clientEmail===null,"D1 support ticket payload omits client email");
  const futureVersion="2099-01-01T00:00:00.000Z";await d1.prepare("UPDATE support_tickets SET updated_at=? WHERE room_id=?").bind(futureVersion,ticket.id).run();
  check((await api("support","",{},{intent:"send",roomId:ticket.id,body:"We can help",nonce:crypto.randomUUID()})).status===200,"D1 support can reply through API");
  const closureNonce=crypto.randomUUID();check((await api("admin2","",{},{intent:"send",roomId:ticket.id,body:"Final reply before closure",nonce:closureNonce})).status===200,"D1 admin can send before closing a ticket");
  const updated=(await api("support","messages",{roomId:ticket.id})).body.room;
  check(Date.parse(updated.ticket.updatedAt)>Date.parse(futureVersion),"D1 ticket replies advance the compare-and-set version strictly");
  const closed=await api("admin2","",{},{intent:"ticket-update",roomId:ticket.id,status:"closed",priority:"high",expectedUpdatedAt:updated.ticket.updatedAt});check(closed.body.room.ticket.status==="closed","D1 API closes tickets");
  const d1Activity=(await api("otherClient","messages",{roomId:ticket.id})).body.messages.findLast((item:{senderRole:string;body:string})=>item.senderRole==="system"&&item.body.includes("closed this ticket"));
  check(d1Activity?.body==="EdiCut Admin closed this ticket.","D1 ticket activity hides administrator account names");
  check((await api("admin2","",{},{intent:"send",roomId:ticket.id,body:"Final reply before closure",nonce:closureNonce})).status===403,"D1 does not return a stored message nonce after its ticket closes");
  check((await api("otherClient","",{},{intent:"send",roomId:ticket.id,body:"Closed",nonce:crypto.randomUUID()})).status===403,"D1 API cannot send to closed tickets");
  const summary=await api("admin","unread");check(summary.body.projects>0 && summary.body.tickets>0,"D1 API counts both inboxes");
  check((await api("client","sync",{roomId:"invalid"})).status===400,"D1 API validates UUIDs");
  env.CHAT_MAINTENANCE="true";const before=Number(await d1.prepare("SELECT count(*) AS count FROM chat_messages").first("count"));
  check((await api("client","",{},{intent:"send",roomId:group.id,body:"Paused",nonce:crypto.randomUUID()})).status===503,"Migration maintenance blocks writes");
  await api("admin");check(Number(await d1.prepare("SELECT count(*) AS count FROM chat_messages").first("count"))===before,"Maintenance GET never creates welcome messages");delete env.CHAT_MAINTENANCE;
  delete env.CHAT_D1;check((await api("client")).status===503,"Missing binding fails closed without PostgreSQL fallback");env.CHAT_D1=d1;
  await pg`UPDATE customer_subscriptions SET status='unpaid',paid_at=NULL,paid_by=NULL WHERE owner_id='10000000-0000-4000-8000-000000000001'`;
  check(!(await api("client","messages",{roomId:group.id})).body.messages.length,"Real source revocation hides D1 content");
  check((await api("manager","messages",{roomId:group.id})).status===404,"Real source revocation removes manager access");
  check((await api("client","",{},{intent:"send",roomId:group.id,body:"API D1 hello",nonce})).status===403,"D1 refuses an old message retry after payment access is revoked");
  console.log(`${checks} D1 API checks passed using isolated PostgreSQL and local workerd.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "D1 API verification failed"); process.exitCode=1;
} finally {
  await pg`UPDATE customer_subscriptions SET status='paid',paid_at=now(),paid_by='20000000-0000-4000-8000-000000000001' WHERE owner_id='10000000-0000-4000-8000-000000000001'`;
  await pg.end();await app.dispose();process.exit(process.exitCode ?? 0);
}
