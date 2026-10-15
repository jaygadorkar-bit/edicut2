import { useEffect, useRef, useState } from "react";

export type ChatLiveEvent = { type: "refresh" } | { type: "typing"; roomId: string; name: string; actorKey: string };
// Leave an idle interval beyond Neon's five-minute autosuspend threshold.
export const CHAT_LIVE_RESYNC_MS = 10 * 60_000;
export const CHAT_FALLBACK_RESYNC_MS = 60_000;

/** Heartbeats only keep the socket healthy; they never refresh database data. */
export function startChatSocket(scope: string, onEvent: (event: ChatLiveEvent) => void, onStatus: (status: string) => void) {
  let disposed = false, socket: WebSocket | undefined, retry: ReturnType<typeof setTimeout> | undefined, stableConnection: ReturnType<typeof setTimeout> | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined, bootstrap: ReturnType<typeof setTimeout> | undefined;
  let failures = 0, lastPong = Date.now(), lastRefresh = Date.now();
  const active = () => !disposed && document.visibilityState === "visible" && navigator.onLine;
  const refresh = () => {
    if (!active()) return;
    lastRefresh = Date.now(); onEvent({ type: "refresh" });
  };
  const reconnect = () => {
    if (!active()) return;
    clearTimeout(retry);
    retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** Math.min(++failures, 5)) + Math.random() * 500);
  };
  const connect = () => {
    if (!active() || socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    onStatus(failures ? "Reconnecting" : "Connecting");
    const url = new URL(`/api/chat/socket?scope=${scope}`, window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    try { socket = new WebSocket(url); } catch { onStatus("Reconnecting"); reconnect(); return; }
    const current = socket;
    current.onopen = () => {
      if (disposed || socket !== current) return;
      clearTimeout(bootstrap); bootstrap = undefined;
      lastPong = Date.now(); onStatus("Live"); refresh();
      clearTimeout(stableConnection);
      stableConnection = setTimeout(() => {
        if (!disposed && socket === current && current.readyState === WebSocket.OPEN) failures = 0;
      }, 30_000);
    };
    current.onmessage = message => {
      if (disposed || socket !== current) return;
      lastPong = Date.now(); if (message.data === "pong") return;
      try {
        const event = JSON.parse(message.data);
        if (event?.type === "refresh") refresh();
        else if (event?.type === "typing" && typeof event.roomId === "string" && typeof event.name === "string" && typeof event.actorKey === "string") onEvent(event);
      } catch { /* Ignore non-protocol frames. */ }
    };
    current.onerror = () => current.close();
    current.onclose = () => {
      if (socket !== current) return;
      clearTimeout(stableConnection);
      if (disposed) return;
      onStatus(navigator.onLine ? "Reconnecting" : "Offline"); reconnect();
    };
  };
  const tick = () => {
    if (!active()) return;
    if (socket?.readyState === WebSocket.OPEN) {
      if (Date.now() - lastPong > 65_000) socket.close(); else socket.send("ping");
    }
    const period = socket?.readyState === WebSocket.OPEN ? CHAT_LIVE_RESYNC_MS : CHAT_FALLBACK_RESYNC_MS;
    if (Date.now() - lastRefresh >= period) refresh();
  };
  const pause = () => {
    clearTimeout(retry); clearTimeout(stableConnection); clearTimeout(bootstrap); clearInterval(heartbeat);
    retry = stableConnection = bootstrap = heartbeat = undefined;
    const previous = socket; socket = undefined; previous?.close(1000);
  };
  const resume = () => {
    if (!active()) { pause(); onStatus(navigator.onLine ? "Paused" : "Offline"); return; }
    if (heartbeat !== undefined) return;
    heartbeat = setInterval(tick, 30_000);
    // The first socket open supplies fresh history. A blocked socket must not
    // prevent history loading, so fall back to HTTP after a short grace period.
    bootstrap = setTimeout(() => { bootstrap = undefined; refresh(); }, 1000);
    connect();
  };
  resume();
  window.addEventListener("online", resume); window.addEventListener("offline", resume);
  document.addEventListener("visibilitychange", resume);
  return () => {
    disposed = true; pause();
    window.removeEventListener("online", resume); window.removeEventListener("offline", resume);
    document.removeEventListener("visibilitychange", resume);
  };
}

export function useChatSocket(scope: string, enabled: boolean, onEvent: (event: ChatLiveEvent) => void, actorKey?: string) {
  const [status, setStatus] = useState("Connecting");
  const eventRef = useRef(onEvent); eventRef.current = onEvent;
  useEffect(() => {
    if (!enabled) { setStatus("Not available"); return; }
    return startChatSocket(scope, event => eventRef.current(event), setStatus);
  }, [scope, enabled, actorKey]);
  return status;
}

/** Coalesce event bursts and allow at most one follow-up while a request runs. */
export function createChatRefreshQueue(run: () => Promise<void>, delay = 150) {
  let timer: ReturnType<typeof setTimeout> | undefined, active = false, pending = false, disposed = false;
  const drain = async () => {
    if (disposed) return;
    if (active) { pending = true; return; }
    active = true;
    try { await run(); }
    finally { active = false; if (pending && !disposed) { pending = false; schedule(); } }
  };
  const schedule = () => {
    if (disposed) return;
    clearTimeout(timer); timer = setTimeout(() => void drain(), delay);
  };
  return { schedule, dispose() { disposed = true; clearTimeout(timer); } };
}
