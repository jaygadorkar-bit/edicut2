// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectReviewWorkspace } from "./ProjectReviewWorkspace";
import { ReviewPlaybackMenu } from "./ReviewPlaybackMenu";
import type { ReviewData, ReviewResult } from "../lib/project-review";

// Keep these tests on the comment lifecycle; media decoding is covered separately.
vi.mock("./ReviewPlayer", () => ({ ReviewPlayer: () => <div>Player</div> }));
const data: ReviewData & { selectedVersionId: string } = {
  project: {
    id: "project",
    ownerId: "client",
    title: "Film",
    channelName: "Studio",
    status: "review",
    deadline: null,
    notes: null,
    updatedAt: "2026-10-15",
  },
  versions: [
    {
      id: "version",
      projectId: "project",
      title: "Cut",
      note: "",
      authorName: "Editor",
      actorKey: "user:editor",
      durationMs: 60000,
      bytes: 100,
      mime: "video/mp4",
      decision: "pending",
      createdAt: "2026-10-15",
      updatedAt: "2026-10-15",
    },
  ],
  comments: [],
  members: [],
  editorOptions: [],
  files: [],
  ready: true,
  canUpload: false,
  canDecide: false,
  canAssign: false,
  actor: {
    id: "client",
    key: "user:client",
    name: "Client",
    role: "customer",
    admin: false,
  },
  features: ["projects"],
  selectedVersionId: "version",
};
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
async function renderWorkspace(
  onAction: (form: FormData) => Promise<ReviewResult>,
) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <ProjectReviewWorkspace
          data={data}
          mediaUrl={() => "/media"}
          onAction={onAction}
          onVersion={() => {}}
        />
      ),
    },
  ]);
  await act(async () => root.render(createElement(RouterProvider, { router })));
}
async function writeDraft(value: string) {
  const input = host.querySelector<HTMLTextAreaElement>(
    "#review-comment-body",
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return input;
}
function deferred() {
  let resolve!: (result: ReviewResult) => void;
  const promise = new Promise<ReviewResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe("comment saving", () => {
  it("shows pending feedback immediately, prevents double sends, then confirms and clears the draft", async () => {
    const request = deferred();
    const send = vi.fn((_form: FormData) => request.promise);
    await renderWorkspace(send);
    const input = await writeDraft("Shorten this opening");
    const form = input.form!;
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".review-comment p")?.textContent).toBe(
      "Shorten this opening",
    );
    expect(host.querySelector(".review-comment__saving")?.textContent).toBe(
      "Saving…",
    );
    await act(async () =>
      request.resolve({
        success: "Comment added.",
        commentId: String(send.mock.calls[0][0].get("commentId")),
      }),
    );
    expect(input.value).toBe("");
    expect(host.querySelector(".review-comment__saving")).toBeNull();
    expect(host.querySelectorAll(".review-comment")).toHaveLength(1);
  });
  it("rolls back failed feedback, keeps its draft, and retries with the same idempotency key", async () => {
    const send = vi.fn(
      async (_form: FormData): Promise<ReviewResult> => ({
        error: "Connection interrupted",
      }),
    );
    await renderWorkspace(send);
    const input = await writeDraft("Keep this draft");
    const submit = () =>
      input.form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    await act(async () => {
      submit();
    });
    expect(host.querySelector(".review-comment")).toBeNull();
    expect(input.value).toBe("Keep this draft");
    const id = send.mock.calls[0][0].get("commentId");
    await act(async () => {
      submit();
    });
    expect(send.mock.calls[1][0].get("commentId")).toBe(id);
    await writeDraft("A corrected draft");
    await act(async () => {
      submit();
    });
    expect(send.mock.calls[2][0].get("commentId")).not.toBe(id);
  });
});
describe("playback menu", () => {
  it("supports arrow navigation, selection, escape, outside dismissal, and disabled state", async () => {
    const choose = vi.fn();
    const render = (disabled = false) =>
      root.render(
        <ReviewPlaybackMenu
          label="Playback speed"
          value="1"
          options={[
            { value: "1", label: "1×" },
            { value: "2", label: "2×" },
          ]}
          onChange={choose}
          disabled={disabled}
        />,
      );
    await act(async () => render());
    const trigger = host.querySelector("button")!;
    const key = (key: string) =>
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    await act(async () => {
      key("ArrowDown");
      key("End");
    });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    await act(async () => {
      key("Enter");
    });
    expect(choose).toHaveBeenLastCalledWith("2");
    await act(async () => {
      trigger.click();
    });
    await act(async () => {
      key("Escape");
    });
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => {
      trigger.click();
    });
    await act(async () => {
      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
    });
    expect(host.querySelector('[role="listbox"]')).toBeNull();
    await act(async () => render(true));
    expect(trigger.disabled).toBe(true);
  });
});
