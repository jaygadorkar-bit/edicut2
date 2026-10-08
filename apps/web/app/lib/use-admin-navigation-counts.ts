import { useEffect, useState } from "react";
import { adminPath } from "./admin-paths";

type Counts = { pendingOrderCount: number; unreadEnquiryCount: number };

/** Native background requests keep notification updates out of the page loading overlay. */
export function useAdminNavigationCounts(pendingOrderCount: number, unreadEnquiryCount: number) {
  const [counts, setCounts] = useState<Counts>({ pendingOrderCount, unreadEnquiryCount });
  useEffect(() => {
    setCounts({ pendingOrderCount, unreadEnquiryCount });
    let controller: AbortController | undefined;
    let disposed = false;
    const refresh = async () => {
      if (disposed || controller || document.visibilityState !== "visible" || !navigator.onLine) return;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 10_000);
      try {
        const response = await fetch(adminPath("/navigation-counts"), {
          signal: controller.signal, cache: "no-store", credentials: "same-origin",
        });
        if (disposed) return;
        if (response.status === 403) {
          setCounts({ pendingOrderCount: 0, unreadEnquiryCount: 0 });
          return;
        }
        if (!response.ok) return;
        const next = await response.json() as Partial<Counts> | null;
        if (!disposed && next && typeof next.pendingOrderCount === "number" && Number.isSafeInteger(next.pendingOrderCount) && next.pendingOrderCount >= 0
            && typeof next.unreadEnquiryCount === "number" && Number.isSafeInteger(next.unreadEnquiryCount) && next.unreadEnquiryCount >= 0) {
          setCounts({ pendingOrderCount: next.pendingOrderCount, unreadEnquiryCount: next.unreadEnquiryCount });
        }
      } catch {
        // Keep the last successful counts through temporary network failures.
      } finally {
        window.clearTimeout(timeout);
        controller = undefined;
      }
    };
    const interval = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [pendingOrderCount, unreadEnquiryCount]);
  return counts;
}
