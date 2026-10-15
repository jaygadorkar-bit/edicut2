import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startAdminNavigationPolling } from "./admin-navigation-live";

let page: EventTarget & { visibilityState: string };
beforeEach(() => {
  vi.useFakeTimers();
  page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", page); vi.stubGlobal("window", new EventTarget()); vi.stubGlobal("navigator", { onLine: true });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("admin badge polling", () => {
  it("uses fresh route counts initially and ignores focus noise", async () => {
    const read = vi.fn(async () => {}), stop = startAdminNavigationPolling(read);
    window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(29_999);
    expect(read).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledOnce(); stop(); expect(vi.getTimerCount()).toBe(0);
  });
  it("stops all timers while hidden and reads once on return", async () => {
    const read = vi.fn(async () => {}), stop = startAdminNavigationPolling(read);
    page.visibilityState = "hidden"; page.dispatchEvent(new Event("visibilitychange"));
    expect(vi.getTimerCount()).toBe(0); await vi.advanceTimersByTimeAsync(600_000); expect(read).not.toHaveBeenCalled();
    page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0); expect(read).toHaveBeenCalledOnce(); stop();
  });
  it("aborts hidden work and starts a fresh request on a quick return", async () => {
    let finish!: () => void;
    const read = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const stop = startAdminNavigationPolling(read); await vi.advanceTimersByTimeAsync(30_000);
    const signal = read.mock.calls[0][0] as AbortSignal;
    page.visibilityState = "hidden"; page.dispatchEvent(new Event("visibilitychange")); expect(signal.aborted).toBe(true);
    page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2); finish(); await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1); stop();
  });
  it("does not overlap active requests and aborts slow requests", async () => {
    let finish!: () => void;
    const read = vi.fn(() => new Promise<void>(resolve => { finish = resolve; })), stop = startAdminNavigationPolling(read);
    await vi.advanceTimersByTimeAsync(30_000); window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(10_000); expect(read).toHaveBeenCalledOnce();
    expect((read.mock.calls[0] as unknown as [AbortSignal])[0].aborted).toBe(true);
    finish(); await vi.advanceTimersByTimeAsync(30_000); expect(read).toHaveBeenCalledTimes(2); stop(); finish();
  });
  it("stops polling after access is revoked", async () => {
    const read = vi.fn(async () => false), stop = startAdminNavigationPolling(read);
    await vi.advanceTimersByTimeAsync(30_000); expect(vi.getTimerCount()).toBe(0);
    window.dispatchEvent(new Event("online")); page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(600_000); expect(read).toHaveBeenCalledOnce(); stop();
  });
  it("keeps offline and initially hidden pages idle", async () => {
    Object.assign(navigator, { onLine: false }); page.visibilityState = "hidden";
    const read = vi.fn(async () => {}), stop = startAdminNavigationPolling(read);
    expect(vi.getTimerCount()).toBe(0); Object.assign(navigator, { onLine: true }); window.dispatchEvent(new Event("online"));
    expect(read).not.toHaveBeenCalled(); page.visibilityState = "visible"; page.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0); expect(read).toHaveBeenCalledOnce();
    Object.assign(navigator, { onLine: false }); window.dispatchEvent(new Event("offline")); expect(vi.getTimerCount()).toBe(0); stop();
  });
});
