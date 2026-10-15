import { useEffect, useState } from "react";
import { adminPath } from "./admin-paths";
import { startAdminNavigationPolling } from "./admin-navigation-live";

type Counts = { pendingOrderCount: number; unreadEnquiryCount: number };

/** Native background requests keep notification updates out of the page loading overlay. */
export function useAdminNavigationCounts(pendingOrderCount: number, unreadEnquiryCount: number) {
  const [counts, setCounts] = useState<Counts>({ pendingOrderCount, unreadEnquiryCount });
  useEffect(() => {
    const apply = (next: Counts) => setCounts(previous => previous.pendingOrderCount === next.pendingOrderCount && previous.unreadEnquiryCount === next.unreadEnquiryCount ? previous : next);
    apply({ pendingOrderCount, unreadEnquiryCount });
    return startAdminNavigationPolling(async signal => {
      try {
        const response = await fetch(adminPath("/navigation-counts"), {
          signal, cache: "no-store", credentials: "same-origin",
        });
        if (signal.aborted) return;
        if (response.status === 401 || response.status === 403) {
          apply({ pendingOrderCount: 0, unreadEnquiryCount: 0 });
          return false;
        }
        if (!response.ok) return;
        const next = await response.json() as Partial<Counts> | null;
        if (!signal.aborted && next && typeof next.pendingOrderCount === "number" && Number.isSafeInteger(next.pendingOrderCount) && next.pendingOrderCount >= 0
            && typeof next.unreadEnquiryCount === "number" && Number.isSafeInteger(next.unreadEnquiryCount) && next.unreadEnquiryCount >= 0) {
          apply({ pendingOrderCount: next.pendingOrderCount, unreadEnquiryCount: next.unreadEnquiryCount });
        }
      } catch {
        // Keep the last successful counts through temporary network failures.
      }
    });
  }, [pendingOrderCount, unreadEnquiryCount]);
  return counts;
}
