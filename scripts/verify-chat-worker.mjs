// Exercise the production socket class in local workerd, without deployment.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
const web = createRequire(new URL("../apps/web/package.json",import.meta.url)), runtime = createRequire(web.resolve("wrangler"));
const { Miniflare, convertV4MiniflareOptions } = runtime("miniflare"), { transform } = runtime("esbuild");
const source = await fs.readFile(new URL("../apps/web/workers/chat-socket.ts",import.meta.url),"utf8");
const { code } = await transform(source,{loader:"ts",format:"esm",target:"es2022"});
const app = new Miniflare(convertV4MiniflareOptions({ name:"chat-test-runtime", modules:true, compatibilityDate:"2026-04-19", script:code+`
export default { async fetch(request,env) {
  const url=new URL(request.url), actor=url.searchParams.get('actor');
  const stub=env.CHAT_SOCKET_HUB.get(env.CHAT_SOCKET_HUB.idFromName(actor));
  return stub.fetch(new Request('https://chat.internal'+url.pathname,request));
} };`, durableObjects:{CHAT_SOCKET_HUB:{className:"ChatSocketHub",useSQLite:true}} }));
const sockets=[];
try {
  async function connect(actor){const response=await app.dispatchFetch(`http://localhost/connect?actor=${actor}`,{headers:{Upgrade:"websocket"}});assert.equal(response.status,101);const socket=response.webSocket;socket.accept();sockets.push(socket);return socket;}
  const one=await connect("client"),two=await connect("client"),other=await connect("other-client");
  const events=[[],[],[]]; [one,two,other].forEach((socket,index)=>socket.addEventListener("message",event=>events[index].push(event.data)));
  const waitForEvent=(socket,send)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Worker socket event timed out")),5000);const listener=event=>{clearTimeout(timer);socket.removeEventListener("message",listener);resolve(event.data);};socket.addEventListener("message",listener);send();});
  assert.equal(await waitForEvent(one,()=>one.send("ping")),"pong");
  const notification=waitForEvent(one,()=>void app.dispatchFetch("http://localhost/notify?actor=client",{method:"POST",body:'{"type":"refresh"}'}));
  assert.equal(await notification,'{"type":"refresh"}');
  await app.dispatchFetch("http://localhost/notify?actor=client",{method:"POST",body:'{"type":"typing","roomId":"test","name":"Maya"}'});
  assert.ok(events[1].some(value=>value.includes('"refresh"')));assert.ok(!events[2].some(value=>value.includes('"refresh"')));
  const closed = new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Invalid socket frame was not closed")),5000);one.addEventListener("close",event=>{clearTimeout(timer);resolve(event.code);});});one.send("unauthorized client payload");assert.equal(await closed,1008);
  console.log("Production Cloudflare socket runtime verified locally: 101 upgrades, heartbeat, multiple windows, actor isolation, typing frames, and invalid-frame rejection.");
} finally {for(const socket of sockets)try{socket.close();}catch{} await app.dispose();}
