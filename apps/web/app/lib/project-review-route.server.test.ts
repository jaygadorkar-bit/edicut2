import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  project: vi.fn(),
  load: vi.fn(),
  mutate: vi.fn(),
  save: vi.fn(),
  upload: vi.fn(),
  stream: vi.fn(),
  remove: vi.fn(),
  limit: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("./project-review.server", async (original) => ({
  ...(await original<typeof import("./project-review.server")>()),
  requireReviewActor: mocks.actor,
  findReviewProject: mocks.project,
  loadProjectReview: mocks.load,
  mutateProjectReview: mocks.mutate,
  saveReviewVersion: mocks.save,
}));
vi.mock("./project-review-media.server", async (original) => ({
  ...(await original<typeof import("./project-review-media.server")>()),
  uploadReviewVideo: mocks.upload,
  streamReviewVideo: mocks.stream,
  deleteReviewVideo: mocks.remove,
}));
vi.mock("./usage-protection.server", () => ({
  consumeUsageLimit: mocks.limit,
}));
import {
  projectReviewAction,
  projectReviewLoader,
} from "./project-review-route.server";
const projectId = "44444444-4444-4444-8444-444444444444",
  versionId = "55555555-5555-4555-8555-555555555555";
const args = (request: Request) =>
  ({ request, params: { projectId }, context: {} }) as unknown as Parameters<
    typeof projectReviewAction
  >[0];
const request = (
  body: FormData | URLSearchParams,
  origin = "http://localhost:3002",
) =>
  new Request(`http://localhost:3002/api/project-reviews/${projectId}`, {
    method: "POST",
    headers: { Origin: origin },
    body,
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.actor.mockResolvedValue({
    db: { execute: mocks.execute },
    actor: {
      id: "client",
      key: "client",
      name: "Client",
      role: "customer",
      admin: false,
    },
    features: ["projects", "reviews"],
  });
  mocks.limit.mockResolvedValue("allowed");
  mocks.project.mockResolvedValue({ id: projectId });
  mocks.mutate.mockResolvedValue({ success: "Saved" });
  mocks.execute.mockResolvedValue([]);
  mocks.upload.mockResolvedValue(undefined);
  mocks.remove.mockResolvedValue(undefined);
});
describe("review route boundaries", () => {
  it("rejects cross-site requests before authentication or uploads", async () => {
    const result = await projectReviewAction(
      args(
        request(
          new URLSearchParams({ intent: "add-comment" }),
          "https://untrusted.invalid",
        ),
      ),
      false,
    );
    expect(result).toMatchObject({ status: 403 });
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects client multipart uploads without touching the provider", async () => {
    const form = new FormData();
    form.set("video", new File(["video"], "cut.mp4", { type: "video/mp4" }));
    await expect(
      projectReviewAction(args(request(form)), false),
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("honors rate limiting before reading or writing a project", async () => {
    mocks.limit.mockResolvedValue("limited");
    expect(
      await projectReviewAction(
        args(request(new URLSearchParams({ intent: "add-comment" }))),
        false,
      ),
    ).toHaveProperty("error");
    expect(mocks.project).not.toHaveBeenCalled();
  });
  it("rejects client binary upload chunks before contacting YouTube",async()=>{const incoming=new Request(`http://localhost:3002/api/project-reviews/${projectId}?upload=${versionId}&offset=0`,{method:"POST",headers:{Origin:"http://localhost:3002","Content-Type":"application/octet-stream"},body:new Uint8Array(16)});await expect(projectReviewAction(args(incoming),false)).rejects.toMatchObject({status:403});expect(mocks.upload).not.toHaveBeenCalled();});
  it("does not stream a version outside the accessible project", async () => {
    await expect(
      projectReviewLoader(
        args(
          new Request(
            `http://localhost:3002/api/project-reviews/${projectId}?media=${versionId}`,
          ),
        ),
        false,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.stream).not.toHaveBeenCalled();
  });
  it("does not leak driver diagnostics in errors", async () => {
    mocks.mutate.mockRejectedValue(
      new Error("postgres://private-secret@server SQL diagnostics"),
    );
    const result = await projectReviewAction(
      args(request(new URLSearchParams({ intent: "add-comment" }))),
      false,
    );
    expect(JSON.stringify(result)).not.toContain("private-secret");
    expect(result).toHaveProperty("error");
  });
  it("never deletes a private asset after an ambiguous database commit", async () => {
    mocks.actor.mockResolvedValue({
      db: { execute: mocks.execute },
      actor: {
        id: "editor",
        key: "editor",
        name: "Editor",
        role: "editor",
        admin: false,
      },
      features: ["projects", "reviews"],
    });
    mocks.save.mockRejectedValue(new TypeError("Connection dropped"));
    const form = new FormData();
    Object.entries({
      intent: "upload-version",
      title: "Cut",
      note: "",
      durationMs: "1000",
      uploadId: versionId,
    }).forEach(([key, value]) => form.set(key, value));
    form.set("video", new File(["video"], "cut.mp4", { type: "video/mp4" }));
    expect(
      await projectReviewAction(args(request(form)), false),
    ).toHaveProperty("error");
    expect(mocks.upload).toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
