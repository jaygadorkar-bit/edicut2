// Each actor has a separate socket hub. Socket frames contain only notifications;
// messages are fetched through the authenticated API, which checks current access.
export class ChatSocketHub {
  constructor(private state: DurableObjectState) {
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }
  async fetch(request: Request) {
    if (new URL(request.url).pathname === "/notify" && request.method === "POST") {
      const event = await request.text();
      for (const socket of this.state.getWebSockets()) {
        try { socket.send(event); } catch { socket.close(1011, "Reconnect to chat"); }
      }
      return new Response(null, { status: 204 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Upgrade required", { status: 426 });
    if (this.state.getWebSockets().length >= 8) return new Response("Too many open chat windows", { status: 429 });
    const [client, server] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(server);
    server.send('{"type":"ready"}');
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message !== "ping") socket.close(1008, "Use the chat API to send messages");
  }
  webSocketClose(socket: WebSocket, code: number, reason: string) { socket.close(code, reason); }
  webSocketError(socket: WebSocket) { socket.close(1011, "Reconnect to chat"); }
}
