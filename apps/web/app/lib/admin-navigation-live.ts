/** Fresh badge reads while visible, with no overlapping requests or idle timers. */
export function startAdminNavigationPolling(read: (signal: AbortSignal) => Promise<boolean | void>, delay = 30_000) {
  let disposed = false, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
  const active = () => !disposed && document.visibilityState === "visible" && navigator.onLine;
  const schedule = () => { if (active()) timer = setTimeout(() => { timer = undefined; void refresh(); }, delay); };
  const refresh = async () => {
    if (!active() || controller) return;
    const current = new AbortController(); controller = current;
    const timeout = setTimeout(() => current.abort(), 10_000);
    try { if (await read(current.signal) === false && !current.signal.aborted) stop(); }
    catch { /* The next visible interval retries transient failures. */ }
    finally {
      clearTimeout(timeout);
      if (controller === current) { controller = undefined; schedule(); }
    }
  };
  const pause = () => { clearTimeout(timer); timer = undefined; controller?.abort(); controller = undefined; };
  const resume = () => {
    if (!active()) { pause(); return; }
    if (timer === undefined && !controller) void refresh();
  };
  const stop = () => {
    disposed = true; pause();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume); window.removeEventListener("offline", resume);
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume); window.addEventListener("offline", resume);
  // The route already supplies fresh counts; avoid immediately repeating it.
  schedule();
  return stop;
}
