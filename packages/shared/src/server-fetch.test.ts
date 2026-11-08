import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithHeadersTimeout } from "./server-fetch.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchWithHeadersTimeout", () => {
  it("leaves a streamed response body alive after the header deadline", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({ start(controller) { bodyController = controller; } });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal as AbortSignal;
      return new Response(body);
    }));

    const response = await fetchWithHeadersTimeout("https://media.example.test/file", {}, 10);
    await vi.advanceTimersByTimeAsync(20);

    expect(signal?.aborted).toBe(false);
    bodyController?.enqueue(Uint8Array.of(7));
    bodyController?.close();
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([7]);
  });

  it("aborts when the upstream never returns response headers", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init?.signal as AbortSignal;
      signal.addEventListener("abort", () => reject(signal?.reason), { once: true });
    })));

    const pending = fetchWithHeadersTimeout("https://media.example.test/file", {}, 10);
    const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(signal?.aborted).toBe(true);
  });
});
