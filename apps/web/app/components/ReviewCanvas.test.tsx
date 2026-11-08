import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewCanvas } from "./ReviewCanvas";
import { makeAnnotation } from "../lib/review-annotations";

function renderCanvas(annotation: ReturnType<typeof makeAnnotation>) {
  return renderToStaticMarkup(
    createElement(ReviewCanvas, {
      width: 1280,
      height: 720,
      annotation,
      draftAnnotation: null,
      onAnnotation: () => {},
      onMark: () => {},
      onPause: () => {},
      time: 0,
      draftTime: null,
      readOnly: false,
      disabled: false,
      draftBody: "",
      setDraftBody: () => {},
      onPost: () => {},
      busy: false,
      zoom: 1,
      onZoom: () => {},
      onToolChange: () => {},
      toolbarTarget: null,
    }),
  );
}

describe("review canvas geometry", () => {
  it("maps arrows into the source frame aspect ratio without stretching markers", () => {
    const arrow = makeAnnotation(
      "arrow",
      { x: 0.1, y: 0.2 },
      { x: 0.9, y: 0.8 },
      "#a78bfa",
    );
    const html = renderCanvas(arrow);

    expect(html).toContain('viewBox="0 0 1280 720"');
    expect(html).toContain('x1="128"');
    expect(html).toContain('y1="144"');
    expect(html).toContain('x2="1152"');
    expect(html).toContain('y2="576"');
    expect(html).toContain('markerUnits="userSpaceOnUse"');
  });
});
