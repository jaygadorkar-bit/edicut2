import { CustomSource, Input, MP4, WEBM } from "mediabunny";
import type { ReviewSourceFrameRate } from "./review-frame-rate";

const BLOCK_BYTES = 256 * 1024;
const MAX_REQUESTS = 12;
const MAX_PROBE_BYTES = BLOCK_BYTES * MAX_REQUESTS;
const detectedRates = new Map<string, ReviewSourceFrameRate>();

/** A cached, bounded reader: never download the entire movie to find its FPS. */
export function reviewRangeReader(
  src: string,
  bytes: number,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const blocks = new Map<number, Promise<Uint8Array>>();
  let requests = 0;
  const readBlock = (start: number) => {
    const cached = blocks.get(start);
    if (cached) return cached;
    if (++requests > MAX_REQUESTS)
      throw new Error("Frame-rate probe reached its request limit.");
    const end = Math.min(bytes, start + BLOCK_BYTES);
    const pending = (async () => {
      signal.throwIfAborted();
      const response = await fetcher(src, {
        headers: { Range: `bytes=${start}-${end - 1}` },
        credentials: "same-origin",
        mode: "same-origin",
        signal,
      });
      const length = end - start;
      const validRange =
        response.status === 206 &&
        response.headers.get("Content-Range") ===
          `bytes ${start}-${end - 1}/${bytes}`;
      const validSmallFile =
        response.status === 200 && start === 0 && bytes <= BLOCK_BYTES;
      const contentLength = response.headers.get("Content-Length");
      if (
        (!validRange && !validSmallFile) ||
        (contentLength !== null && Number(contentLength) !== length) ||
        !response.body
      ) {
        await response.body?.cancel();
        throw new Error("Video range metadata is unavailable.");
      }
      const reader = response.body.getReader();
      const result = new Uint8Array(length);
      let received = 0;
      try {
        while (received < length) {
          signal.throwIfAborted();
          const part = await reader.read();
          if (part.done || part.value.length > length - received)
            throw new Error("Video range response has an invalid size.");
          result.set(part.value, received);
          received += part.value.length;
        }
        return result;
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    })();
    blocks.set(start, pending);
    return pending;
  };
  return {
    async read(start: number, end: number) {
      signal.throwIfAborted();
      if (
        !Number.isSafeInteger(bytes) ||
        bytes <= 0 ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end > bytes ||
        end <= start ||
        end - start > MAX_PROBE_BYTES
      )
        throw new Error("Invalid video metadata range.");
      const result = new Uint8Array(end - start);
      for (let offset = start; offset < end; ) {
        const blockStart = Math.floor(offset / BLOCK_BYTES) * BLOCK_BYTES;
        const block = await readBlock(blockStart);
        const count = Math.min(
          end - offset,
          block.length - (offset - blockStart),
        );
        result.set(
          block.subarray(offset - blockStart, offset - blockStart + count),
          offset - start,
        );
        offset += count;
      }
      return result;
    },
    dispose: () => blocks.clear(),
  };
}

export async function detectReviewFrameRate(
  src: string,
  bytes: number,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<ReviewSourceFrameRate | null> {
  signal.throwIfAborted();
  const key = `${src}:${bytes}`;
  const cached = detectedRates.get(key);
  if (cached) return cached;
  if (!Number.isSafeInteger(bytes) || bytes <= 0) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const combined = AbortSignal.any([signal, controller.signal]);
  const reader = reviewRangeReader(src, bytes, combined, fetcher);
  const input = new Input({
    formats: [MP4, WEBM],
    source: new CustomSource({
      getSize: () => bytes,
      read: reader.read,
      dispose: reader.dispose,
      maxCacheSize: MAX_PROBE_BYTES,
      prefetchProfile: "none",
    }),
  });
  const abort = () => input.dispose();
  combined.addEventListener("abort", abort, { once: true });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const metrics = await track.computeFrameRateMetrics({
      targetPacketCount: 256,
    });
    combined.throwIfAborted();
    const fps = metrics.underlyingFrameRate ?? metrics.bestGuessFrameRate;
    if (
      metrics.probedPacketCount < 2 ||
      !Number.isFinite(fps) ||
      fps < 1 ||
      fps > 1000
    )
      return null;
    const result = { fps, variable: metrics.underlyingFrameRate === null };
    // Cache only the small metadata result, never private video bytes or URLs on disk.
    if (detectedRates.size >= 32)
      detectedRates.delete(detectedRates.keys().next().value!);
    detectedRates.set(key, result);
    return result;
  } finally {
    combined.removeEventListener("abort", abort);
    clearTimeout(timeout);
    controller.abort();
    input.dispose();
  }
}
