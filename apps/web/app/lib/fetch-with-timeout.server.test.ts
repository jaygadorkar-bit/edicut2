import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "@edicut/shared/server-fetch";

afterEach(() => vi.unstubAllGlobals());

describe("fetchWithTimeout", () => {
  it("aborts an outbound request after its configured timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    })));

    await expect(fetchWithTimeout("https://provider.example/api", {}, 5)).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("preserves caller cancellation", async () => {
    const caller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
    })));

    const pending = fetchWithTimeout("https://provider.example/api", { signal: caller.signal }, 1000);
    caller.abort(new DOMException("Caller cancelled", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
