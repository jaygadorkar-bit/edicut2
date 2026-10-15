import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_LIVE_RESYNC_MS, createChatRefreshQueue, startChatSocket } from "./chat-live";

class FakeSocket {
  static OPEN = 1; static CONNECTING = 0; static CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = 0; sent: string[] = [];
  onopen?: () => void; onmessage?: (event: { data: string }) => void; onclose?: () => void;
  constructor(public url: string) { FakeSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  send(value: string) { this.sent.push(value); if (value === "ping") this.onmessage?.({ data: "pong" }); }
  close() { this.readyState = 3; this.onclose?.(); }
  message(value: string) { this.onmessage?.({ data: value }); }
}
let page: EventTarget & { visibilityState: string };
beforeEach(() => {
  vi.useFakeTimers(); FakeSocket.instances = [];
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { origin: "https://edicut.example.test" } }));
  vi.stubGlobal("navigator", { onLine: true }); vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("event driven chat refresh", () => {
  it("does not fetch data for heartbeats and resyncs a healthy socket every ten minutes", () => {
    const event = vi.fn(), stop = startChatSocket("client", event, vi.fn());
    const socket = FakeSocket.instances[0]; socket.open(); event.mockClear();
    vi.advanceTimersByTime(CHAT_LIVE_RESYNC_MS - 1);
    expect(socket.sent.length).toBe(19); expect(event).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(event).toHaveBeenCalledExactlyOnceWith({ type: "refresh" });
    stop();
  });
  it("loads history once when the initial socket opens and ignores window-focus noise", () => {
    const event = vi.fn(), stop = startChatSocket("client", event, vi.fn());
    expect(event).not.toHaveBeenCalled(); FakeSocket.instances[0].open();
    window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(2000);
    expect(event).toHaveBeenCalledExactlyOnceWith({ type: "refresh" }); stop();
  });
  it("loads history even if a socket never opens, then uses the HTTP fallback", () => {
    const event = vi.fn(), stop = startChatSocket("admin", event, vi.fn());
    vi.advanceTimersByTime(999); expect(event).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(event).toHaveBeenCalledExactlyOnceWith({ type: "refresh" });
    event.mockClear(); vi.advanceTimersByTime(89_000);
    expect(event).toHaveBeenCalledExactlyOnceWith({ type: "refresh" }); stop();
  });
  it("keeps hidden pages quiet and refreshes once on return", () => {
    const event = vi.fn(), stop = startChatSocket("client", event, vi.fn()); const socket = FakeSocket.instances[0]; socket.open(); event.mockClear();
    page.visibilityState = "hidden"; page.dispatchEvent(new Event("visibilitychange"));
    expect(socket.readyState).toBe(FakeSocket.CLOSED); expect(vi.getTimerCount()).toBe(0);
    socket.message('{"type":"refresh"}'); socket.message('{"type":"typing","roomId":"room","name":"Maya","actorKey":"user:manager"}');
    vi.advanceTimersByTime(10 * 60_000); expect(event).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([]); expect(FakeSocket.instances).toHaveLength(1);
    page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("focus")); FakeSocket.instances[1].open();
    expect(event).toHaveBeenCalledExactlyOnceWith({ type: "refresh" }); stop();
  });
  it("does not connect or run timers when initially hidden or offline", () => {
    page.visibilityState = "hidden";
    const event = vi.fn(), stop = startChatSocket("client", event, vi.fn());
    expect(FakeSocket.instances).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
    page.visibilityState = "visible"; Object.assign(navigator, { onLine: false });
    page.dispatchEvent(new Event("visibilitychange")); vi.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(0); expect(event).not.toHaveBeenCalled();
    Object.assign(navigator, { onLine: true }); window.dispatchEvent(new Event("online")); FakeSocket.instances[0].open();
    expect(event).toHaveBeenCalledExactlyOnceWith({ type: "refresh" }); stop();
  });
  it("closes the socket and cancels work offline, then refreshes once online", () => {
    const event = vi.fn(), stop = startChatSocket("client", event, vi.fn()); FakeSocket.instances[0].open(); event.mockClear();
    Object.assign(navigator, { onLine: false }); window.dispatchEvent(new Event("offline"));
    expect(vi.getTimerCount()).toBe(0); vi.advanceTimersByTime(600_000);
    expect(FakeSocket.instances).toHaveLength(1); expect(event).not.toHaveBeenCalled();
    Object.assign(navigator, { onLine: true }); window.dispatchEvent(new Event("online")); FakeSocket.instances[1].open();
    expect(event).toHaveBeenCalledExactlyOnceWith({ type: "refresh" }); stop();
  });
  it("delivers typing separately, ignores invalid frames, and resyncs after reconnect", () => {
    const event = vi.fn(), stop = startChatSocket("admin", event, vi.fn()); const socket = FakeSocket.instances[0]; socket.open(); event.mockClear();
    socket.message('{"type":"typing","roomId":"room","name":"Maya","actorKey":"user:manager"}');
    expect(event).toHaveBeenCalledExactlyOnceWith({ type: "typing", roomId: "room", name: "Maya", actorKey: "user:manager" });
    socket.message("invalid JSON"); socket.message("null"); socket.message('{"type":"typing","name":"invalid"}');
    expect(event).toHaveBeenCalledTimes(1);
    socket.close(); vi.advanceTimersByTime(3000); expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].open(); expect(event).toHaveBeenLastCalledWith({ type: "refresh" }); stop();
  });
  it("keeps exponential backoff across short-lived socket opens", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const stop = startChatSocket("client", vi.fn(), vi.fn());
    FakeSocket.instances[0].open(); FakeSocket.instances[0].close();
    vi.advanceTimersByTime(2000); expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.instances[1].open(); FakeSocket.instances[1].close();
    vi.advanceTimersByTime(3999); expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1); expect(FakeSocket.instances).toHaveLength(3);
    stop();
  });
  it("resets reconnect backoff after a connection stays healthy", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const stop = startChatSocket("client", vi.fn(), vi.fn());
    FakeSocket.instances[0].open(); vi.advanceTimersByTime(30_000); FakeSocket.instances[0].close();
    vi.advanceTimersByTime(1999); expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1); expect(FakeSocket.instances).toHaveLength(2);
    stop();
  });
  it("stops reconnects, refreshes and late frames after cleanup", () => {
    const event = vi.fn(), stop = startChatSocket("client", event, vi.fn()); const socket = FakeSocket.instances[0]; socket.open(); stop(); event.mockClear();
    socket.message('{"type":"refresh"}'); window.dispatchEvent(new Event("focus")); vi.advanceTimersByTime(10 * 60_000);
    expect(event).not.toHaveBeenCalled(); expect(FakeSocket.instances).toHaveLength(1);
  });
  it("coalesces a burst into one request", async () => {
    const run = vi.fn(async () => {}), queue = createChatRefreshQueue(run);
    for (let count = 0; count < 10; count++) queue.schedule();
    await vi.advanceTimersByTimeAsync(150); expect(run).toHaveBeenCalledTimes(1); queue.dispose();
  });
  it("never overlaps requests and runs one follow-up for changes during an active request", async () => {
    let finish!: () => void;
    const run = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const queue = createChatRefreshQueue(run); queue.schedule(); await vi.advanceTimersByTimeAsync(150);
    queue.schedule(); queue.schedule(); await vi.advanceTimersByTimeAsync(150); expect(run).toHaveBeenCalledTimes(1);
    finish(); await vi.advanceTimersByTimeAsync(150); expect(run).toHaveBeenCalledTimes(2); queue.dispose();
  });
  it("cancels queued work on unmount", async () => {
    const run = vi.fn(async () => {}), queue = createChatRefreshQueue(run); queue.schedule(); queue.dispose();
    await vi.advanceTimersByTimeAsync(1000); expect(run).not.toHaveBeenCalled();
  });
});
