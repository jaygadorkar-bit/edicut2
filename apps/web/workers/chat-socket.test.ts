import { describe, expect, it, vi } from "vitest";
import { ChatSocketHub } from "./chat-socket";
describe("per-actor socket hub", () => {
  function hub(sockets: any[] = []) { vi.stubGlobal("WebSocketRequestResponsePair", class { constructor(public request:string, public response:string) {} }); const state = { setWebSocketAutoResponse:vi.fn(), getWebSockets:() => sockets, acceptWebSocket:vi.fn() }; return { hub:new ChatSocketHub(state as any), state }; }
  it("broadcasts server notifications to the actor's windows only", async () => { const first={ send:vi.fn() }, second={ send:vi.fn() }; const { hub:room,state }=hub([first,second]); const result=await room.fetch(new Request("https://chat.internal/notify",{method:"POST",body:'{"type":"refresh"}'})); expect(result.status).toBe(204); expect(first.send).toHaveBeenCalledWith('{"type":"refresh"}'); expect(second.send).toHaveBeenCalledOnce(); expect(state.setWebSocketAutoResponse).toHaveBeenCalledOnce(); });
  it("rejects arbitrary client messages", () => { const socket={ close:vi.fn() }; hub().hub.webSocketMessage(socket as any,'{"subscribe":"another-user"}'); expect(socket.close).toHaveBeenCalledWith(1008,expect.any(String)); });
  it("requires websocket upgrade for public socket connections", async () => { expect((await hub().hub.fetch(new Request("https://chat.internal/connect"))).status).toBe(426); });
  it("limits simultaneous windows per actor", async () => { expect((await hub(Array(8).fill({})).hub.fetch(new Request("https://chat.internal/connect",{headers:{Upgrade:"websocket"}}))).status).toBe(429); });
});
