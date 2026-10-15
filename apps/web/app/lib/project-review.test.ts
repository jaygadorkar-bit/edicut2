import { describe, expect, it } from "vitest";
import {
  formatReviewTime,
  parseFrameAnnotation,
  parseReviewTime,
  projectBriefSections,
  reviewCsv,
  validateReviewComment,
  type ReviewComment,
} from "./project-review";
import { validateReviewVideo } from "./project-review-media.server";
const form = (values: Record<string, string | undefined>) => {
  const result = new FormData();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) result.set(key, value);
  });
  return result;
};
describe("video review validation", () => {
  it("presents brief fields without internal purchase identifiers", () => {
    const sections = projectBriefSections(
      "Purchase: 44444444-4444-4444-8444-444444444444\n\nGoal: Explain the story\n\nEditing instructions:\nKeep the pacing calm.",
    );
    expect(sections).toEqual([
      { label: "Your video", value: "Explain the story" },
      { label: "Editing notes", value: "Keep the pacing calm." },
    ]);
  });
  it("formats and parses timecodes without accepting malformed values", () => {
    expect(formatReviewTime(24500)).toBe("0:24");
    expect(formatReviewTime(3670000)).toBe("1:01:10");
    expect(parseReviewTime("1:01:10")).toBe(3670000);
    expect(parseReviewTime("0:24")).toBe(24000);
    ["NaN", "1:60", "-1:05", "0:99:01", "99:00:00"].forEach((value) =>
      expect(parseReviewTime(value)).toBeNull(),
    );
  });
  it("rejects unsafe annotations, out-of-video times, and invalid ranges", () => {
    const valid = { x: 0.2, y: 0.1, width: 0.4, height: 0.3 };
    expect(parseFrameAnnotation(JSON.stringify(valid))).toEqual(valid);
    [
      "[]",
      "null",
      '{"x":0,"y":0,"width":2,"height":1}',
      '{"x":"0","y":0,"width":1,"height":1}',
    ].forEach((value) => expect(parseFrameAnnotation(value)).toBeUndefined());
    expect(
      validateReviewComment(
        form({
          body: "Trim this section",
          timestampMs: "2000",
          endMs: "5000",
          annotation: JSON.stringify(valid),
        }),
        10000,
      ).value,
    ).toMatchObject({ timestampMs: 2000, endMs: 5000, annotation: valid });
    [
      { timestampMs: "10001" },
      { timestampMs: "-1" },
      { timestampMs: "NaN" },
      { timestampMs: "2000", endMs: "1000" },
      { annotation: JSON.stringify(valid) },
    ].forEach((values) =>
      expect(
        validateReviewComment(form({ body: "Change this", ...values }), 10000)
          .error,
      ).toBeDefined(),
    );
  });
  it("exports text safely for spreadsheet software", () => {
    const comment = {
      body: '=HYPERLINK("bad")',
      authorName: "+Name",
      timestampMs: 1000,
      endMs: null,
      resolved: false,
      category: "change",
      priority: "normal",
      parentId: null,
    } as ReviewComment;
    const csv = reviewCsv([comment]);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+Name");
    expect(csv).toContain('"0:01"');
  });
  it("validates media signatures in addition to extension and browser MIME", async () => {
    const mp4 = new Uint8Array([
      0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0,
    ]);
    expect(
      await validateReviewVideo(
        new File([mp4], "cut.mp4", { type: "video/mp4" }),
      ),
    ).toBeNull();
    expect(
      await validateReviewVideo(
        new File(["not video"], "cut.mp4", { type: "video/mp4" }),
      ),
    ).toContain("does not match");
    expect(
      await validateReviewVideo(
        new File([mp4], "cut.mp4", { type: "text/html" }),
      ),
    ).toContain("Choose");
  });
});
