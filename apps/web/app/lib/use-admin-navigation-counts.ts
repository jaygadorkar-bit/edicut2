import { useCallback, useEffect, useState } from "react";
import { adminPath } from "./admin-paths";
import { startAdminNavigationPolling } from "./admin-navigation-live";
import { subscribeWorkspaceRealtime, type WorkspaceRealtimeStatus } from "./workspace-realtime.client";

type Counts = { pendingOrderCount: number; unreadEnquiryCount: number; availableUpdateCount: number };

/** Native background requests keep notification updates out of the page loading overlay. */
export function useAdminNavigationCounts(pendingOrderCount: number, unreadEnquiryCount: number, availableUpdateCount = 0) {
  const [counts, setCounts] = useState<Counts>({ pendingOrderCount, unreadEnquiryCount, availableUpdateCount });
  useEffect(() => {
    setCounts({ pendingOrderCount, unreadEnquiryCount, availableUpdateCount });
  }, [pendingOrderCount, unreadEnquiryCount, availableUpdateCount]);

  const apply = useCallback((next: Counts) => setCounts(previous =>
    previous.pendingOrderCount === next.pendingOrderCount
      && previous.unreadEnquiryCount === next.unreadEnquiryCount
      && previous.availableUpdateCount === next.availableUpdateCount
      ? previous
      : next), []);

  useEffect(() => {
    let controller: AbortController | undefined;
    let pending = false;
    let debounce: number | undefined;
    let stopFallback: (() => void) | undefined;
    let disposed = false;

    const read = async (signal: AbortSignal) => {
      try {
        const response = await fetch(adminPath("/navigation-counts"), {
          signal, cache: "no-store", credentials: "same-origin",
        });
        if (signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          apply({ pendingOrderCount: 0, unreadEnquiryCount: 0, availableUpdateCount: 0 });
          return false;
        }
        if (!response.ok) return;
        const next = await response.json() as Partial<Counts> | null;
        if (!signal.aborted && next && typeof next.pendingOrderCount === "number" && Number.isSafeInteger(next.pendingOrderCount) && next.pendingOrderCount >= 0
            && typeof next.unreadEnquiryCount === "number" && Number.isSafeInteger(next.unreadEnquiryCount) && next.unreadEnquiryCount >= 0
            && typeof next.availableUpdateCount === "number" && Number.isSafeInteger(next.availableUpdateCount) && next.availableUpdateCount >= 0) {
          apply({ pendingOrderCount: next.pendingOrderCount, unreadEnquiryCount: next.unreadEnquiryCount, availableUpdateCount: next.availableUpdateCount });
        }
      } catch {
        // Keep the last successful counts through temporary network failures.
      }
    };
    const refresh = () => {
      if (debounce !== undefined) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = undefined;
        if (disposed) return;
        if (controller) {
          pending = true;
          return;
        }
        controller = new AbortController();
        const current = controller;
        void read(current.signal).finally(() => {
          if (controller !== current) return;
          controller = undefined;
          if (pending && !disposed) {
            pending = false;
            refresh();
          }
        });
      }, 150);
    };
    const stopRealtime = subscribeWorkspaceRealtime(
      "admin",
      refresh,
      (status: WorkspaceRealtimeStatus) => {
        if (status === "connected") {
          stopFallback?.();
          stopFallback = undefined;
        } else if (status === "unavailable" || status === "disconnected") {
          stopFallback ??= startAdminNavigationPolling(read, 30_000);
        }
      },
    );
    refresh();
    return () => {
      disposed = true;
      stopRealtime();
      stopFallback?.();
      if (debounce !== undefined) window.clearTimeout(debounce);
      controller?.abort();
    };
  }, [apply]);
  return counts;
}
