import { useEffect, useState } from "react";
import { createChatRefreshQueue, startChatSocket } from "./chat-live";
import type { ChatUnreadCounts } from "./chat";

export type { ChatUnreadCounts } from "./chat";
const unreadEvent = "edicut:chat-unread";
const emptyCounts: ChatUnreadCounts = { projects: 0, tickets: 0 };

export function refreshChatUnreadCounts(scope: string, counts?: ChatUnreadCounts) {
  window.dispatchEvent(new CustomEvent(unreadEvent, { detail: { scope, counts } }));
}
const validCounts = (value: Partial<ChatUnreadCounts> | null | undefined): value is ChatUnreadCounts => Boolean(value
  && Number.isSafeInteger(value.projects) && value.projects! >= 0 && Number.isSafeInteger(value.tickets) && value.tickets! >= 0);

/** Chat pages publish counts from their snapshot. Other pages share one live badge feed. */
export function useChatUnreadCounts(scope: "client" | "admin", enabled: boolean, initialCounts = emptyCounts, managed = false) {
  const [counts, setCounts] = useState(initialCounts);
  useEffect(() => {
    setCounts(initialCounts);
    if (!enabled) return;
    let controller: AbortController | undefined;
    let disposed = false, stopped = false;
    let stopSocket: (() => void) | undefined;
    const applyCounts = (next: ChatUnreadCounts) => setCounts(previous => previous.projects === next.projects && previous.tickets === next.tickets ? previous : next);
    const refresh = async () => {
      if (disposed || stopped || managed || document.visibilityState !== "visible" || !navigator.onLine) return;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch(`/api/chat?scope=${scope}&operation=unread`, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (disposed) return;
        if (response.status === 401 || response.status === 403) { setCounts(emptyCounts); stopped = true; stopSocket?.(); return; }
        if (!response.ok) return;
        const next = await response.json() as Partial<ChatUnreadCounts> | null;
        if (!disposed && validCounts(next)) applyCounts(next);
      } catch {
        // Keep the last successful counts through temporary network failures.
      } finally {
        window.clearTimeout(timeout);
        controller = undefined;
      }
    };
    const queue = createChatRefreshQueue(refresh);
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ scope: string; counts?: ChatUnreadCounts }>).detail;
      if (detail?.scope !== scope) return;
      if (validCounts(detail.counts)) applyCounts(detail.counts);
      else if (!managed) queue.schedule();
    };
    window.addEventListener(unreadEvent, onChange);
    if (!managed) stopSocket = startChatSocket(scope, event => { if (event.type === "refresh") queue.schedule(); }, () => {});
    return () => {
      disposed = true;
      controller?.abort();
      stopSocket?.(); queue.dispose();
      window.removeEventListener(unreadEvent, onChange);
    };
  }, [scope, enabled, managed, initialCounts.projects, initialCounts.tickets]);
  return counts;
}
