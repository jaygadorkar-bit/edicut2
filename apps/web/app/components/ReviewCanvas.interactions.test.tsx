// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ReviewCanvas } from "./ReviewCanvas";
import type { FrameAnnotation } from "../lib/review-annotations";

it("keeps a floating draft open when another control consumes Escape", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const post = vi.fn();
  function Canvas() {
    const [annotation, setAnnotation] = useState<FrameAnnotation | null>(null);
    return (
      <ReviewCanvas
        width={320}
        height={180}
        annotation={annotation}
        draftAnnotation={annotation}
        onAnnotation={setAnnotation}
        onMark={() => {}}
        onPause={() => {}}
        time={0}
        draftTime={0}
        readOnly={false}
        disabled={false}
        draftBody="Keep this draft"
        setDraftBody={() => {}}
        onPost={post}
        busy={false}
        zoom={1}
        onZoom={() => {}}
        onToolChange={() => {}}
        toolbarTarget={null}
      />
    );
  }
  try {
    await act(async () => root.render(<Canvas />));
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>('[aria-label="Place a comment"]')!
        .click();
    });
    await act(async () => {
      host.querySelector('[aria-label="On-video annotations"]')!.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(
      host.querySelector('[aria-label="Floating comment composer"]'),
    ).not.toBeNull();
    // The app hydrates the document: native document listeners can see an
    // Escape already prevented by a menu's React keyboard handler.
    await act(async () => {
      const escape = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      escape.preventDefault();
      document.dispatchEvent(escape);
    });
    expect(
      host.querySelector<HTMLTextAreaElement>('[aria-label="On-video comment"]')
        ?.value,
    ).toBe("Keep this draft");
    expect(post).not.toHaveBeenCalled();
    // Native document listeners can run before the delegated React handler.
    // Dropdown focus must also isolate Escape before preventDefault is set.
    const dropdown = document.createElement("button");
    dropdown.setAttribute("role", "combobox");
    document.body.appendChild(dropdown);
    try {
      await act(async () => {
        dropdown.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      expect(
        host.querySelector('[aria-label="Floating comment composer"]'),
      ).not.toBeNull();
    } finally {
      dropdown.remove();
    }
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(
      host.querySelector('[aria-label="Floating comment composer"]'),
    ).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
