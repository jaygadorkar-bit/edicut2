import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { ProjectReviewWorkspace } from "./ProjectReviewWorkspace";
import type {
  ReviewComment,
  ReviewData,
  ReviewVersion,
} from "../lib/project-review";

const version: ReviewVersion = {
  id: "version",
  projectId: "project",
  title: "Launch cut",
  note: "",
  authorName: "Editor",
  actorKey: "user:editor",
  durationMs: 60000,
  bytes: 1000,
  mime: "video/mp4",
  provider: "google_drive",
  decision: "pending",
  createdAt: "2026-10-15T00:00:00Z",
  updatedAt: "2026-10-15T00:00:00Z",
};
const comment: ReviewComment = {
  id: "revision",
  versionId: "version",
  parentId: null,
  actorKey: "user:client",
  authorName: "Client",
  authorRole: "customer",
  body: "Trim the opening",
  timestampMs: 1000,
  endMs: null,
  annotation: null,
  category: "change",
  priority: "normal",
  resolved: false,
  createdAt: "2026-10-15T00:00:00Z",
  updatedAt: "2026-10-15T00:00:00Z",
};
const base: ReviewData & { selectedVersionId: string | null } = {
  project: {
    id: "project",
    ownerId: "client",
    title: "Launch film",
    channelName: "Studio",
    status: "review",
    deadline: null,
    notes: null,
    updatedAt: "2026-10-15T00:00:00Z",
  },
  versions: [version],
  comments: [
    comment,
    {
      ...comment,
      id: "discussion",
      category: "question",
      body: "Is the music licensed?",
    },
  ],
  members: [],
  editorOptions: [],
  files: [],
  ready: true,
  canUpload: false,
  canDecide: true,
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
  storage: { provider: "google_drive", connected: true, maxBytes: 1000 },
};
function render(data = base) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <ProjectReviewWorkspace
          data={data}
          mediaUrl={(id) => `/api/project-reviews/project?media=${id}`}
          onAction={async () => ({ success: "Saved" })}
          onVersion={() => {}}
        />
      ),
    },
  ]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}
describe("proofing workspace", () => {
  it("keeps the version selector in the feedback sidebar and exposes the inspection tools", () => {
    const html = render();
    const header = html
      .split('<header class="review-project-heading">')[1]
      .split("</header>")[0];
    expect(header).not.toContain('id="review-version"');
    const sidebar = html
      .split('class="review-feedback__version"')[1]
      .split('role="tablist"')[0];
    expect(sidebar).toContain('id="review-version"');
    for (const label of [
      "Place a comment",
      "Draw ellipse",
      "Draw rectangle",
      "Draw freehand",
      "Pin a comment",
      "Toggle ruler guides",
      "Toggle 5 by 4 composition grid",
      "Previous frame",
      "Next frame",
      "Record instructions",
    ])
      expect(html).toContain(label);
    expect(html).not.toContain('aria-label="Mark comment range"');
    expect(html).not.toMatch(/>Comment<\/span>/);
  });
  it("labels the frame-rate and playback-speed controls accessibly", () => {
    const html = render();
    expect(html).toContain('aria-label="Source frame rate"');
    expect(html).toContain('aria-label="Playback speed"');
    expect(html).toContain('role="combobox"');
    const fpsControl = html
      .split('aria-label="Source frame rate"')[1]
      .split("</button>")[0];
    expect(fpsControl).toContain('disabled=""');
    expect(fpsControl).toContain("FPS…");
    expect(fpsControl).not.toContain("60 fps");
  });
  it("shows revision notes and discussion together without feedback tabs", () => {
    const html = render();
    const feedback = html.split('aria-label="Version feedback"')[1];
    expect(feedback).toContain("Trim the opening");
    expect(feedback).toContain("Is the music licensed?");
    expect(feedback).toContain("<h2>Feedback</h2>");
    expect(feedback).not.toContain('role="tablist"');
    expect(feedback).not.toContain('id="review-tab-discussion"');
    expect(html.indexOf('class="review-feedback__list"')).toBeLessThan(
      html.indexOf('class="review-feedback__compose"'),
    );
    expect(html).not.toContain("Editor’s note");
    expect(html).not.toContain("Review decision");
    expect(html).not.toContain("Request changes");
    expect(html).not.toContain("Approve version");
    expect(html).not.toMatch(/class="review-feedback__(filters|search|sort)"/);
    expect(html).not.toContain('class="review-workbench__details"');
    expect(html).not.toContain("Ctrl / ⌘ + Enter");
    expect(html).toContain('aria-label="Post comment"');
    expect(html).toContain('aria-label="Record instructions"');
    expect(html).not.toContain(">Record instructions</button>");
  });
  it("keeps the revision composer compact with timestamp and voice actions at the bottom", () => {
    const html = render();
    const composer = html
      .split('class="review-composer"')[1]
      .split("</form>")[0];
    expect(composer).toContain(
      'for="review-comment-body">Add a revision note</label>',
    );
    expect(composer).toContain('placeholder="Add a revision note"');
    expect(composer.indexOf('id="review-comment-body"')).toBeLessThan(
      composer.indexOf('aria-label="Attach current playback time"'),
    );
    expect(composer.indexOf('aria-label="Record instructions"')).toBeLessThan(
      composer.indexOf('aria-label="Post comment"'),
    );
  });
  it("places the timestamp before the action menu and hides categories", () => {
    const html = render();
    const card = html.split('id="comment-revision"')[1].split("</article>")[0];
    expect(card.indexOf("review-comment__time")).toBeLessThan(
      card.indexOf("review-comment__actions"),
    );
    expect(card).toContain(
      'aria-label="More actions for Client&#x27;s comment"',
    );
    expect(card).toContain('role="menuitem">Edit</button>');
    expect(card).toContain(
      'role="menuitem" class="is-destructive">Delete</button>',
    );
    expect(card).toContain("Mark as resolved");
    expect(card).not.toContain("review-category");
    expect(card).not.toContain(">Change</span>");
  });
  it("only renders edit and delete actions for comments owned by the viewer", () => {
    const html = render({
      ...base,
      actor: { ...base.actor, key: "user:another-client" },
    });
    const card = html.split('id="comment-revision"')[1].split("</article>")[0];
    expect(card).not.toContain('role="menuitem">Edit</button>');
    expect(card).not.toContain(">Delete</button>");
    expect(card).toContain("Mark as resolved");
  });
  it("does not crash or render a version selector before a video is uploaded", () => {
    const html = render({
      ...base,
      versions: [],
      comments: [],
      selectedVersionId: null,
    });
    expect(html).toContain("Launch film");
    expect(html).not.toContain('id="review-version"');
    expect(html).not.toContain('aria-label="Video player"');
  });
  it("keeps approved feedback read-only while preserving voice playback", () => {
    const html = render({
      ...base,
      versions: [{ ...version, decision: "approved" }],
      comments: [
        {
          ...comment,
          voice: { mime: "audio/webm", bytes: 100, durationMs: 2000 },
        },
      ],
    });
    expect(html).not.toContain("Record instructions");
    expect(html).not.toContain('id="review-comment-body"');
    expect(html).toContain("?voice=revision");
    expect(html).toContain("Voice instruction from Client");
  });
});
