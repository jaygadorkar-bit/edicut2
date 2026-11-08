import { describe, expect, it, vi } from "vitest";
import {
  BufferTarget,
  EncodedPacket,
  EncodedVideoPacketSource,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
} from "mediabunny";
import {
  formatReviewFrameRate,
  reviewFrameRateOptions,
} from "./review-frame-rate";
import {
  detectReviewFrameRate,
  reviewRangeReader,
} from "./review-frame-rate.client";

const BLOCK = 256 * 1024;
function rangeFetch(data: Uint8Array) {
  return vi.fn<typeof fetch>(async (_url, init) => {
    const range = new Headers(init?.headers).get("Range")!;
    const [, startText, endText] = /^bytes=(\d+)-(\d+)$/.exec(range)!;
    const start = Number(startText),
      end = Number(endText);
    return new Response(data.slice(start, end + 1), {
      status: 206,
      headers: { "Content-Range": `bytes ${start}-${end}/${data.length}` },
    });
  });
}

async function timingFixture(
  fps: number,
  webm = false,
  largeFirstPacket = false,
) {
  const target = new BufferTarget();
  const output = new Output({
    target,
    format: webm ? new WebMOutputFormat() : new Mp4OutputFormat(),
  });
  const source = new EncodedVideoPacketSource(webm ? "vp8" : "avc");
  output.addVideoTrack(source, {
    frameRate: fps,
    decoderConfig: {
      codec: webm ? "vp8" : "avc1.42c00a",
      codedWidth: 16,
      codedHeight: 16,
      ...(!webm
        ? {
            description: new Uint8Array([
              1, 66, 192, 10, 255, 225, 0, 4, 103, 66, 192, 10, 1, 0, 2, 104, 0,
            ]),
          }
        : {}),
    },
  });
  await output.start();
  // Timing-only fixtures: the probe never decodes the image payload.
  for (let i = 0; i < 300; i++) {
    const payload =
      largeFirstPacket && i === 0
        ? new Uint8Array(BLOCK * 20)
        : new Uint8Array([0, 0, 0, 2, 101, 0]);
    if (largeFirstPacket && i === 0) {
      new DataView(payload.buffer).setUint32(0, payload.length - 4);
      payload[4] = 101;
    }
    await source.add(new EncodedPacket(payload, "key", i / fps, 1 / fps));
  }
  await output.finalize();
  return new Uint8Array(target.buffer!);
}

describe("review source frame rates", () => {
  it("never offers rates above the detected source, including fractional sources", () => {
    for (const fps of [
      12,
      23.976,
      24000 / 1001,
      24,
      25,
      29.97,
      30,
      50,
      59.94,
      60,
      120,
    ]) {
      const rates = reviewFrameRateOptions(fps);
      expect(rates.at(-1)).toBe(fps);
      expect(rates.every((rate) => rate <= fps)).toBe(true);
      expect(new Set(rates.map(formatReviewFrameRate)).size).toBe(rates.length);
    }
    for (const invalid of [null, 0, NaN, Infinity])
      expect(reviewFrameRateOptions(invalid)).toEqual([]);
  });
  it.each([
    [24000 / 1001, false],
    [30, false],
    [60000 / 1001, false],
    [24, true],
  ] as const)(
    "reads actual %s FPS packet timestamps (WebM: %s)",
    async (fps, webm) => {
      const data = await timingFixture(fps, webm);
      const fetcher = rangeFetch(data);
      const result = await detectReviewFrameRate(
        `/fixture/${fps}/${webm}`,
        data.length,
        new AbortController().signal,
        fetcher,
      );
      expect(result?.fps).toBeCloseTo(fps, 2);
      expect(result?.variable).toBe(false);
      expect(fetcher.mock.calls.length).toBeLessThanOrEqual(12);
      const count = fetcher.mock.calls.length;
      await detectReviewFrameRate(
        `/fixture/${fps}/${webm}`,
        data.length,
        new AbortController().signal,
        fetcher,
      );
      expect(fetcher).toHaveBeenCalledTimes(count);
    },
  );
  it("finds tail metadata while skipping large encoded frame payloads", async () => {
    const data = await timingFixture(25, false, true);
    const fetcher = rangeFetch(data);
    const result = await detectReviewFrameRate(
      "/fixture/tail-metadata",
      data.length,
      new AbortController().signal,
      fetcher,
    );
    expect(result?.fps).toBe(25);
    expect(data.length).toBeGreaterThan(BLOCK * 12);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(3);
  });
  it("caches metadata blocks and reads ranges crossing block boundaries", async () => {
    const data = Uint8Array.from({ length: BLOCK * 2 }, (_, i) => i % 251);
    const fetcher = rangeFetch(data);
    const reader = reviewRangeReader(
      "/media",
      data.length,
      new AbortController().signal,
      fetcher,
    );
    expect(await reader.read(4, 30)).toEqual(data.slice(4, 30));
    await reader.read(8, 16);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await reader.read(BLOCK - 2, BLOCK + 3)).toEqual(
      data.slice(BLOCK - 2, BLOCK + 3),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("stops at twelve range requests instead of scanning a large movie", async () => {
    const data = new Uint8Array(BLOCK * 20);
    const fetcher = rangeFetch(data);
    const reader = reviewRangeReader(
      "/large-media",
      data.length,
      new AbortController().signal,
      fetcher,
    );
    for (let i = 0; i < 12; i++) await reader.read(i * BLOCK, i * BLOCK + 1);
    await expect(reader.read(12 * BLOCK, 12 * BLOCK + 1)).rejects.toThrow(
      "request limit",
    );
    expect(fetcher).toHaveBeenCalledTimes(12);
  });
  it("rejects ignored ranges and oversized bodies without downloading the movie", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(new Uint8Array([1]), { status: 200 }),
    );
    const reader = reviewRangeReader(
      "/ignored-range",
      BLOCK * 2,
      new AbortController().signal,
      fetcher,
    );
    await expect(reader.read(0, 10)).rejects.toThrow("range metadata");
    const oversized = reviewRangeReader(
      "/oversized",
      BLOCK,
      new AbortController().signal,
      async () =>
        new Response(new Uint8Array(BLOCK + 1), {
          status: 206,
          headers: { "Content-Range": `bytes 0-${BLOCK - 1}/${BLOCK}` },
        }),
    );
    await expect(oversized.read(0, 10)).rejects.toThrow("invalid size");
  });
  it("cancels pending reads without retrying when the reviewer leaves", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(init!.signal!.reason),
            { once: true },
          );
        }),
    );
    const reader = reviewRangeReader(
      "/canceled",
      BLOCK,
      controller.signal,
      fetcher,
    );
    const pending = reader.read(0, 10);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
