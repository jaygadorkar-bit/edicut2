import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
import type { ActionFunctionArgs } from "react-router";
import type { ReviewActor } from "./project-review";
const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  begin: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  mutate: vi.fn(),
  stream: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("./google-drive-storage.server", async (original) => ({
  ...(await original<typeof import("./google-drive-storage.server")>()),
  googleDriveAccessToken: mocks.token,
  beginGoogleDriveUpload: mocks.begin,
  sendGoogleDriveUpload: mocks.send,
  verifyGoogleDriveFile: mocks.verify,
}));
vi.mock("./project-review.server", async (original) => ({
  ...(await original<typeof import("./project-review.server")>()),
  mutateProjectReview: mocks.mutate,
}));
vi.mock("./project-review-media.server", async (original) => ({
  ...(await original<typeof import("./project-review-media.server")>()),
  streamGoogleDriveReviewVideo: mocks.stream,
}));
import {
  addReviewVoiceComment,
  streamReviewVoice,
  validateReviewVoice,
} from "./review-voice.server";
const projectId = "44444444-4444-4444-8444-444444444444",
  versionId = "55555555-5555-4555-8555-555555555555",
  commentId = "66666666-6666-4666-8666-666666666666";
const actor: ReviewActor = {
  id: "11111111-1111-4111-8111-111111111111",
  key: "user:11111111-1111-4111-8111-111111111111",
  name: "Client",
  role: "customer",
  admin: false,
};
const db = { execute: mocks.execute } as unknown as DatabaseClient;
const args = {
  request: new Request(
    `http://localhost:3002/api/project-reviews/${projectId}`,
  ),
  params: { projectId },
  context: {},
} as unknown as ActionFunctionArgs;
function recording() {
  return new File(
    [new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...Array(28).fill(0)])],
    "instruction.webm",
    { type: "audio/webm" },
  );
}
function form() {
  const f = new FormData();
  Object.entries({
    intent: "add-comment",
    versionId,
    commentId,
    body: "Shorten the opening",
    timestampMs: "1000",
    category: "change",
    priority: "normal",
    voiceDurationMs: "2000",
  }).forEach(([k, v]) => f.set(k, v));
  f.set("voice", recording());
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  mocks.token.mockResolvedValue("private-token");
  mocks.begin.mockResolvedValue("private-upload");
  mocks.send.mockResolvedValue(
    new Response(JSON.stringify({ id: "private-drive-file-123" })),
  );
  mocks.verify.mockResolvedValue(undefined);
  mocks.mutate.mockResolvedValue({ success: "Comment added.", commentId });
});
afterEach(() => vi.unstubAllGlobals());
describe("private review voice instructions", () => {
  it("cleans up an upload after a confirmed refusal", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ durationMs: 60000, decision: "pending" }])
      .mockResolvedValueOnce([]);
    mocks.mutate.mockResolvedValue({
      error: "Version approved while uploading.",
    });
    const cleanup = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", cleanup);
    expect(
      await addReviewVoiceComment(args, db, actor, projectId, form()),
    ).toHaveProperty("error");
    expect(cleanup).toHaveBeenCalledWith(
      "https://www.googleapis.com/drive/v3/files/private-drive-file-123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
  it("preserves an upload when a database interruption could have committed the comment", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ durationMs: 60000, decision: "pending" }])
      .mockResolvedValueOnce([]);
    mocks.mutate.mockRejectedValue(new Error("Connection interrupted"));
    const cleanup = vi.fn();
    vi.stubGlobal("fetch", cleanup);
    await expect(
      addReviewVoiceComment(args, db, actor, projectId, form()),
    ).rejects.toThrow("Connection interrupted");
    expect(cleanup).not.toHaveBeenCalled();
  });
  it("cleans up an unverified provider file before attempting a comment save", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ durationMs: 60000, decision: "pending" }])
      .mockResolvedValueOnce([]);
    mocks.verify.mockRejectedValue(
      new Response("Could not verify audio.", { status: 502 }),
    );
    const cleanup = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", cleanup);
    await expect(
      addReviewVoiceComment(args, db, actor, projectId, form()),
    ).rejects.toMatchObject({ status: 502 });
    expect(cleanup).toHaveBeenCalledOnce();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("rejects spoofed, oversized, or excessively long audio", async () => {
    expect(await validateReviewVoice(recording(), 2000)).toBeNull();
    expect(
      await validateReviewVoice(
        new File(["<html>not audio</html>"], "voice.webm", {
          type: "audio/webm",
        }),
        2000,
      ),
    ).toContain("format");
    expect(
      await validateReviewVoice(
        new File([new Uint8Array(2097153)], "voice.webm", {
          type: "audio/webm",
        }),
        2000,
      ),
    ).toContain("2 MB");
    expect(await validateReviewVoice(recording(), 120001)).toContain(
      "two minutes",
    );
    expect(await validateReviewVoice(recording(), NaN)).toContain(
      "two minutes",
    );
  });
  it("checks project and version access before contacting storage", async () => {
    mocks.execute.mockResolvedValueOnce([]);
    await expect(
      addReviewVoiceComment(args, db, actor, projectId, form()),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps approved versions read-only before uploading", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ durationMs: 60000, decision: "approved" }])
      .mockResolvedValueOnce([]);
    expect(
      await addReviewVoiceComment(args, db, actor, projectId, form()),
    ).toHaveProperty("error");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("uploads verified audio and passes storage metadata through a trusted server parameter", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ durationMs: 60000, decision: "pending" }])
      .mockResolvedValueOnce([]);
    expect(
      await addReviewVoiceComment(args, db, actor, projectId, form()),
    ).toEqual({ success: "Comment added.", commentId });
    expect(mocks.verify).toHaveBeenCalledWith(
      "private-drive-file-123",
      32,
      "audio/webm",
      "private-token",
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      db,
      actor,
      projectId,
      expect.any(FormData),
      expect.objectContaining({
        driveFileId: "private-drive-file-123",
        durationMs: 2000,
        digest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
  it("recovers an identical retry without uploading a second file", async () => {
    const digest = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", await recording().arrayBuffer()),
      ),
    )
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    const voice = {
      driveFileId: "private-drive-file-123",
      mime: "audio/webm",
      bytes: 32,
      durationMs: 2000,
      digest,
    };
    mocks.execute
      .mockResolvedValueOnce([{ durationMs: 60000, decision: "pending" }])
      .mockResolvedValueOnce([
        { annotation: { format: 2, drawing: null, voice } },
      ]);
    expect(
      await addReviewVoiceComment(args, db, actor, projectId, form()),
    ).toHaveProperty("success");
    expect(mocks.begin).not.toHaveBeenCalled();
    expect(mocks.mutate).toHaveBeenCalledWith(
      db,
      actor,
      projectId,
      expect.any(FormData),
      voice,
    );
  });
  it("rejects a changed recording on the same comment identifier", async () => {
    mocks.execute
      .mockResolvedValueOnce([{ durationMs: 60000, decision: "pending" }])
      .mockResolvedValueOnce([
        {
          annotation: {
            format: 2,
            drawing: null,
            voice: {
              driveFileId: "private-drive-file-123",
              mime: "audio/webm",
              bytes: 32,
              durationMs: 2000,
              digest: "b".repeat(64),
            },
          },
        },
      ]);
    expect(
      await addReviewVoiceComment(args, db, actor, projectId, form()),
    ).toHaveProperty("error");
    expect(mocks.begin).not.toHaveBeenCalled();
  });
  it("does not stream an attachment when the project lookup denies access", async () => {
    mocks.execute.mockResolvedValueOnce([]);
    await expect(
      streamReviewVoice(args, db, actor, projectId, commentId),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("streams an authorized recording through the same private range-capable media proxy", async () => {
    const voice = {
      driveFileId: "private-drive-file-123",
      mime: "audio/webm",
      bytes: 32,
      durationMs: 2000,
      digest: "b".repeat(64),
    };
    mocks.execute.mockResolvedValueOnce([
      { annotation: { format: 2, drawing: null, voice } },
    ]);
    mocks.stream.mockResolvedValue(new Response("audio"));
    expect(
      await streamReviewVoice(args, db, actor, projectId, commentId),
    ).toBeInstanceOf(Response);
    expect(mocks.stream).toHaveBeenCalledWith(
      voice,
      args.request,
      db,
      args.context,
    );
  });
});
