import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), driveToken: vi.fn() }));
vi.mock("./cloudinary.server", () => ({
  requireCloudinaryEnv: async () => ({
    cloudName: "test",
    apiKey: "test-key",
    apiSecret: "never-return-this",
  }),
  signUpload: async () => "signature",
}));
vi.mock("@edicut/shared/server-fetch", () => ({
  fetchWithTimeout: mocks.fetch,
  UPLOAD_FETCH_TIMEOUT_MS: 30000,
}));
vi.mock("./google-drive-storage.server", () => ({
  googleDriveAccessToken: mocks.driveToken,
  safeGoogleDriveFileId: (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_-]{10,240}$/.test(value),
}));
import { streamGoogleDriveReviewVideo, streamReviewVideo } from "./project-review-media.server";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.driveToken.mockResolvedValue("private-access-token");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("private video delivery", () => {
  it("forwards byte ranges and streams without exposing provider credentials", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: { "Content-Range": "bytes 0-2/20", "Content-Length": "3" },
      }),
    );
    const response = await streamReviewVideo(
      {
        publicId: "edicut/reviews/project/video.webm",
        mime: "video/webm",
        bytes: 20,
      },
      new Request("http://localhost/video", {
        headers: { Range: "bytes=0-2" },
      }),
      {} as never,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-2/20");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Type")).toBe("video/webm");
    expect(mocks.fetch.mock.calls[0][1].headers).toEqual({
      Range: "bytes=0-2",
    });
    expect(mocks.fetch.mock.calls[0][0]).toContain("expires_at");
    expect([...response.headers].join()).not.toContain("test-key");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });
  it("rejects multi-range and malformed requests before contacting storage", async () => {
    const response = await streamReviewVideo(
      { publicId: "private", mime: "video/mp4", bytes: 20 },
      new Request("http://localhost/video", {
        headers: { Range: "bytes=0-2,4-6" },
      }),
      {} as never,
    );
    expect(response.status).toBe(416);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("streams a private Drive file with byte ranges and keeps the bearer token server-side", async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://drive.usercontent.google.com/download?id=1Abcdefghijklmnop" } }))
      .mockResolvedValueOnce(new Response(new Uint8Array([4, 5, 6]), { status: 206, headers: { "Content-Range": "bytes 4-6/20", "Content-Length": "3" } }));
    const response = await streamGoogleDriveReviewVideo(
      { driveFileId: "1Abcdefghijklmnop", mime: "video/mp4", bytes: 20 },
      new Request("http://localhost/video", { headers: { Range: "bytes=4-6" } }),
      {} as never,
      {} as never,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 4-6/20");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(new Headers(mocks.fetch.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer private-access-token");
    expect(new Headers(mocks.fetch.mock.calls[1][1].headers).get("Authorization")).toBeNull();
    expect(new Headers(mocks.fetch.mock.calls[1][1].headers).get("Range")).toBe("bytes=4-6");
    expect([...response.headers].join()).not.toContain("private-access-token");
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([4, 5, 6]);
  });
  it("rejects non-Google redirects and malformed Drive ranges", async () => {
    mocks.fetch.mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://attacker.invalid/video.mp4" } }));
    await expect(streamGoogleDriveReviewVideo(
      { driveFileId: "1Abcdefghijklmnop", mime: "video/mp4", bytes: 20 },
      new Request("http://localhost/video"), {} as never, {} as never,
    )).rejects.toMatchObject({ status: 502 });
    mocks.fetch.mockClear();
    const malformed = await streamGoogleDriveReviewVideo(
      { driveFileId: "1Abcdefghijklmnop", mime: "video/mp4", bytes: 20 },
      new Request("http://localhost/video", { headers: { Range: "bytes=0-2,4-6" } }), {} as never, {} as never,
    );
    expect(malformed.status).toBe(416);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("ends a canceled Drive stream quietly when the viewer leaves playback", async () => {
    const controller = new AbortController();
    mocks.fetch.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      (init.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")), { once: true });
    }));
    const pending = streamGoogleDriveReviewVideo(
      { driveFileId: "1Abcdefghijklmnop", mime: "video/mp4", bytes: 20 },
      new Request("http://localhost/video", { signal: controller.signal }),
      {} as never,
      {} as never,
    );
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
    controller.abort();
    const response = await pending;
    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("closes a Drive response body cleanly when the browser aborts a range read", async () => {
    const requestController = new AbortController();
    let driveBody!: ReadableStreamDefaultController<Uint8Array>;
    mocks.fetch.mockResolvedValue(new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        driveBody = controller;
        controller.enqueue(new Uint8Array([4]));
      },
    }), { status: 206, headers: { "Content-Range": "bytes 0-19/20" } }));
    const response = await streamGoogleDriveReviewVideo(
      { driveFileId: "1Abcdefghijklmnop", mime: "video/mp4", bytes: 20 },
      new Request("http://localhost/video", { signal: requestController.signal }),
      {} as never,
      {} as never,
    );
    const reader = response.body!.getReader();
    await expect(reader.read()).resolves.toMatchObject({ done: false, value: new Uint8Array([4]) });
    requestController.abort();
    driveBody.error(new DOMException("The operation was aborted.", "AbortError"));
    await expect(reader.read()).resolves.toMatchObject({ done: true });
  });
  it("keeps the stream alive after the header deadline has elapsed", async () => {
    vi.useFakeTimers();
    mocks.fetch.mockResolvedValue(new Response("video"));
    await streamReviewVideo(
      { publicId: "private", mime: "video/mp4", bytes: 5 },
      new Request("http://localhost/video"),
      {} as never,
    );
    const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
    await vi.advanceTimersByTimeAsync(13000);
    expect(signal.aborted).toBe(false);
  });
});
