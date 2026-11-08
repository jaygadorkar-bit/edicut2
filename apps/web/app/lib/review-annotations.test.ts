import { describe, expect, it } from "vitest";
import {
  ANNOTATION_COLORS,
  annotationShapes,
  combineAnnotations,
  makeAnnotation,
  parseAnnotation,
  reviewFrameTimecode,
  stepReviewFrame,
} from "./review-annotations";
import { decodeReviewMetadata, encodeReviewMetadata } from "./project-review";
const box = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
describe("saved proofing annotations", () => {
  it("uses purple as the default drawing color", () => {
    expect(ANNOTATION_COLORS[0]).toBe("#a78bfa");
  });
  it("keeps legacy rectangles and round-trips multiple directed shapes", () => {
    expect(parseAnnotation(JSON.stringify(box))).toEqual(box);
    const arrow = makeAnnotation(
      "arrow",
      { x: 0.8, y: 0.7 },
      { x: 0.1, y: 0.2 },
      "#f97316",
    );
    const ellipse = makeAnnotation(
      "ellipse",
      { x: 0.2, y: 0.2 },
      { x: 0.4, y: 0.5 },
      "#38bdf8",
    );
    const saved = parseAnnotation(
      JSON.stringify(combineAnnotations([arrow, ellipse])),
    );
    expect(annotationShapes(saved)).toEqual([arrow, ellipse]);
    expect(annotationShapes(saved)[0].start).toEqual({ x: 0.8, y: 0.7 });
  });
  it("bounds horizontal and vertical arrows inside the frame", () => {
    for (const end of [
      { x: 1, y: 0.5 },
      { x: 0.5, y: 1 },
    ]) {
      const arrow = makeAnnotation("arrow", { x: 0.5, y: 0.5 }, end, "#ffffff");
      expect(parseAnnotation(JSON.stringify(arrow))).toEqual(arrow);
    }
  });
  it("rejects invalid paths, unsafe styles, and excessive payloads", () => {
    for (const shape of [
      { ...box, color: "url(https://untrusted.invalid)" },
      { ...box, kind: "script" },
      { ...box, x: -0.1 },
      { ...box, kind: "arrow", start: { x: 0, y: 0 }, end: { x: 2, y: 0 } },
      {
        ...box,
        kind: "pen",
        points: Array.from({ length: 201 }, () => ({ x: 0, y: 0 })),
      },
      { ...box, shapes: Array.from({ length: 21 }, () => box) },
    ])
      expect(parseAnnotation(JSON.stringify(shape))).toBeUndefined();
    expect(parseAnnotation(" ".repeat(64001))).toBeUndefined();
  });
  it("does not retain arbitrary client properties", () => {
    expect(
      parseAnnotation(
        JSON.stringify({
          ...box,
          voice: { driveFileId: "untrusted-file" },
          html: "<script>",
        }),
      ),
    ).toEqual(box);
  });
  it("steps consistently at fractional frame rates and clamps to the clip", () => {
    for (const fps of [23.976, 24, 25, 29.97, 30, 59.94, 60]) {
      const next = stepReviewFrame(0, fps, 1, 60000);
      expect(next).toBeCloseTo(1000 / fps, 2);
      expect(stepReviewFrame(next, fps, 1, 60000)).toBeCloseTo(2000 / fps, 2);
      expect(stepReviewFrame(next, fps, -1, 60000)).toBeCloseTo(0, 2);
    }
    expect(stepReviewFrame(0, 30, -1, 60000)).toBe(0);
    expect(stepReviewFrame(60000, 30, 1, 60000)).toBe(60000);
    expect(reviewFrameTimecode(1000, 25)).toBe("00:00:01:00");
    expect(reviewFrameTimecode(33.334, 30)).toBe("00:00:00:01");
  });
  it("preserves drawing and private voice metadata without accepting invalid storage references", () => {
    const voice = {
      driveFileId: "private-drive-file-123",
      mime: "audio/webm",
      bytes: 100,
      durationMs: 2000,
      digest: "a".repeat(64),
    };
    expect(decodeReviewMetadata(encodeReviewMetadata(box, voice))).toEqual({
      annotation: box,
      voice,
    });
    expect(decodeReviewMetadata(box)).toEqual({ annotation: box, voice: null });
    for (const patch of [
      { driveFileId: "https://evil.invalid" },
      { durationMs: 120001 },
      { mime: "text/html" },
      { digest: "bad" },
      { bytes: 2097153 },
    ])
      expect(
        decodeReviewMetadata(encodeReviewMetadata(box, { ...voice, ...patch }))
          .voice,
      ).toBeNull();
  });
});
