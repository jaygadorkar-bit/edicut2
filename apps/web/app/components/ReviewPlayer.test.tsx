// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ReviewPlayer } from "./ReviewPlayer";

vi.mock("../lib/review-frame-rate.client", () => ({
  detectReviewFrameRate: async () => ({ fps: 30, variable: false }),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("initializes an already-cached video without waiting for a missed metadata event", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(4);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <ReviewPlayer
          src="/cached.mp4"
          title="Cached cut"
          durationMs={60000}
          mediaBytes={100}
          comments={[]}
          onTime={() => {}}
          onMark={() => {}}
          onAddComment={() => {}}
          onAnnotation={() => {}}
          onSelectComment={() => {}}
          playerRef={{ current: null }}
          draftBody=""
          setDraftBody={() => {}}
          onPost={() => {}}
          busy={false}
          draftTime={null}
        />,
      ),
    );
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Mute video"]')
        ?.disabled,
    ).toBe(false);
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Source frame rate"]')
        ?.disabled,
    ).toBe(false);
    expect(
      host.querySelector('[aria-label="Source frame rate"]')?.textContent,
    ).toBe("30 fps");
    const controls = host.querySelector(".review-player__transport")!;
    const buttons = controls.querySelectorAll("button");
    expect(buttons[0].getAttribute("aria-label")).toBe("Mute video");
    expect(buttons[buttons.length - 1].getAttribute("aria-label")).toBe(
      "Fullscreen video",
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
