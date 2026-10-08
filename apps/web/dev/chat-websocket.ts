import { WebSocketServer, type WebSocket } from "ws";
import type { Plugin } from "vite";
import type { ChatEvent } from "../app/lib/chat-realtime.server";

export function chatWebSocketPlugin(): Plugin {
  return { name: "edicut-chat-websocket", configureServer(server) {
    const sockets = new Map<string, Set<WebSocket>>();
    const ws = new WebSocketServer({ noServer: true, maxPayload: 256 });
    globalThis.__edicutChatNotify = (keys, event: ChatEvent) => {
      const payload = JSON.stringify(event);
      for (const key of new Set(keys)) for (const socket of sockets.get(key) ?? []) if (socket.readyState === 1) socket.send(payload);
    };
    server.httpServer?.on("upgrade", async (incoming, socket, head) => {
      if (!incoming.url?.split("?")[0].endsWith("/api/chat/socket")) return;
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
        const request = new Request(`http://${incoming.headers.host}${incoming.url}`, { headers });
        const module = await server.ssrLoadModule("/app/lib/chat-socket.server.ts");
        const actor = await module.authorizeChatSocket(request) as { key: string };
        if ((sockets.get(actor.key)?.size ?? 0) >= 8) throw new Response("Too many chat windows", { status: 429 });
        ws.handleUpgrade(incoming, socket, head, connection => {
          const set = sockets.get(actor.key) ?? new Set(); sockets.set(actor.key, set); set.add(connection);
          connection.send('{"type":"ready"}');
          connection.on("message", data => { if (data.toString() === "ping") connection.send("pong"); else connection.close(1008); });
          connection.on("close", () => { set.delete(connection); if (!set.size) sockets.delete(actor.key); });
          connection.on("error", () => connection.close());
        });
      } catch (error) {
        const status = error instanceof Response && [401, 403, 429, 503].includes(error.status) ? error.status : 401;
        socket.end(`HTTP/1.1 ${status} Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      }
    });
    server.httpServer?.once("close", () => { for (const set of sockets.values()) for (const socket of set) socket.close(1001); ws.close(); globalThis.__edicutChatNotify = undefined; });
  } };
}
