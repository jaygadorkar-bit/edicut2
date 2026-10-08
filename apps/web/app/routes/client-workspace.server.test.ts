import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const projectRows = vi.fn(async () => [] as unknown[]);
  const projectCounts = vi.fn(async () => [{ count: 0 }]);
  const projectOffset = vi.fn();
  const db = { select: vi.fn((fields?: Record<string, unknown>) => ({
    from: () => fields && "count" in fields
      ? { where: () => projectCounts() }
      : { where: () => ({ orderBy: () => ({ limit: () => ({ offset: (value: number) => { projectOffset(value); return projectRows(); } }) }) }) },
  })) };
  return {
    db,
    projectRows,
    projectCounts,
    projectOffset,
    access: vi.fn(async () => ({ db, userId: "owner", user: { name: "Client", email: "client@qa.invalid" }, features: ["projects"] })),
    load: vi.fn(async () => ({ profile: null as unknown, purchases: [] as unknown[] })),
    saveProfile: vi.fn(async () => true), create: vi.fn(async () => ({ id: "saved-project" })), limit: vi.fn(async () => "allowed"),
  };
});
vi.mock("../lib/client-workspace-access.server", () => ({ requireClientWorkspace: mocks.access, clientNavigation: () => [] }));
vi.mock("../lib/client-workspace.server", () => ({ loadClientWorkspace: mocks.load, saveCreatorProfile: mocks.saveProfile, createPurchasedProject: mocks.create, isMissingClientWorkspaceSchema: (error: unknown) => (error as { code?: string })?.code === "42P01" }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.limit }));
import { action as projectAction, loader as projectLoader } from "./dashboard-projects";
import { action as channelAction, loader as channelLoader } from "./dashboard-channel";
const profile = { channelName: "QA Channel", channelUrl: "https://youtube.com/@qa", brandUrl: "" };
const brief = { intent: "create-project", requestToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", subscriptionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "New video", objective: "Explain a new experiment", videoType: "YouTube video", finishedMinutes: "8", rawMinutes: "60", aspectRatio: "16:9", resolution: "1080p", deadline: "2099-12-01", footageUrl: "https://drive.google.com/drive/folders/qa", instructions: "Keep a steady pace and include captions.", captions: "Burned-in", editingHours: "2" };
const args = (page: string, body?: Record<string, string>, origin = "http://localhost:3002") => ({ request: new Request(`http://localhost:3002/dashboard/${page}`, body ? { method: "POST", headers: { Origin: origin }, body: new URLSearchParams(body) } : {}), context: {}, params: {} }) as Parameters<typeof projectAction>[0];
beforeEach(() => { vi.clearAllMocks(); mocks.limit.mockResolvedValue("allowed"); mocks.load.mockResolvedValue({ profile: null, purchases: [] }); mocks.projectRows.mockResolvedValue([]); mocks.projectCounts.mockResolvedValue([{ count: 0 }]); });
describe("paid client onboarding and project boundaries", () => {
  it("keeps project history available when a paid client's creator profile is missing", async () => {
    mocks.load.mockResolvedValue({ profile: null, purchases: [{ id: "paid" }] });
    await expect(projectLoader(args("projects"))).resolves.toMatchObject({ profile: null, purchases: [{ id: "paid" }], projects: [], ready: true });
  });
  it("loads existing project history even when the creator profile has been reset", async () => {
    const existingProject = { id: "prior-project", title: "Previously submitted edit" };
    mocks.load.mockResolvedValue({ profile: null, purchases: [{ id: "paid" }] });
    mocks.projectRows.mockResolvedValue([existingProject]);
    await expect(projectLoader(args("projects"))).resolves.toMatchObject({ profile: null, projects: [existingProject], ready: true });
  });
  it("paginates long project histories and clamps requests beyond the last page", async () => {
    const existingProject = { id: "prior-project", title: "Older submitted edit" };
    mocks.projectCounts.mockResolvedValue([{ count: 51 }]);
    mocks.projectRows.mockResolvedValue([existingProject]);
    const requestArgs = { request: new Request("http://localhost:3002/dashboard/projects?page=99"), context: {}, params: {} } as Parameters<typeof projectLoader>[0];
    await expect(projectLoader(requestArgs)).resolves.toMatchObject({ projects: [existingProject], projectCount: 51, page: 3, pageCount: 3, hasNext: false });
    expect(mocks.projectOffset).toHaveBeenCalledWith(50);
  });
  it("shows a purchase gate for clients with no paid package", async () => { const data = await projectLoader(args("projects")); expect(data.projects).toEqual([]); expect(data.profile).toBeNull(); expect(data.ready).toBe(true); });
  it("prevents channel setup for clients with no paid package", async () => {
    try { await channelLoader(args("channel")); } catch (response) { expect((response as Response).headers.get("Location")).toBe("/dashboard/projects"); }
  });
  it("forwards existing channel links to the combined profile page", async () => {
    mocks.load.mockResolvedValue({ profile: { channelName: "QA Channel", channelUrl: "https://youtube.com/@qa", brandUrl: "" }, purchases: [{ id: "paid" }] });
    try { await channelLoader(args("channel")); } catch (response) { expect((response as Response).headers.get("Location")).toBe("/dashboard/profile#channel-profile"); }
  });
  it.each(["channel", "projects"])("rejects cross-site %s actions before any DB access", async page => {
    const result = await (page === "channel" ? channelAction : projectAction)(args(page, { intent: "create-project" }, "https://evil.example"));
    expect(result).toBeInstanceOf(Response); expect((result as Response).status).toBe(403); expect(mocks.access).not.toHaveBeenCalled();
  });
  it("does not hide non-schema failures", async () => { mocks.load.mockRejectedValueOnce(new Error("DB unavailable")); await expect(projectLoader(args("projects"))).rejects.toThrow("DB unavailable"); });
  it("handles an unapplied migration without opening the project form", async () => { mocks.load.mockRejectedValueOnce({ code: "42P01" }); expect((await projectLoader(args("projects"))).ready).toBe(false); });
  it("preserves submitted channel values and returns field errors", async () => {
    const result = await channelAction(args("channel", { ...profile, intent: "save-channel", channelUrl: "http://bad.example" }));
    expect(result).toMatchObject({ errors: { channelUrl: expect.any(String) }, values: { channelName: "QA Channel" } }); expect(mocks.saveProfile).not.toHaveBeenCalled();
  });
  it("saves valid profile details for the authenticated owner then unlocks projects", async () => {
    const response = await channelAction(args("channel", { ...profile, intent: "save-channel" }));
    expect(response).toBeInstanceOf(Response); expect((response as Response).headers.get("Location")).toBe("/dashboard/profile#channel-profile");
    expect(mocks.saveProfile).toHaveBeenCalledWith(mocks.db, "owner", expect.objectContaining(profile));
  });
  it("enforces the paid purchase requirement again on a profile POST", async () => { mocks.saveProfile.mockResolvedValueOnce(false); expect(await channelAction(args("channel", { ...profile, intent: "save-channel" }))).toMatchObject({ error: expect.stringContaining("confirmed package") }); });
  it("requires valid record IDs before attempting a reservation", async () => { expect(await projectAction(args("projects", { ...brief, subscriptionId: "wrong" }))).toHaveProperty("error"); expect(mocks.create).not.toHaveBeenCalled(); });
  it("keeps invalid brief values and skips project creation", async () => { expect(await projectAction(args("projects", { ...brief, footageUrl: "http://example.com" }))).toMatchObject({ errors: { footageUrl: expect.any(String) }, values: { title: "New video" } }); expect(mocks.create).not.toHaveBeenCalled(); });
  it("submits a complete brief for the authenticated owner with its replay token", async () => {
    const response = await projectAction(args("projects", brief));
    expect((response as Response).headers.get("Location")).toBe("/dashboard/projects?created=saved-project#your-projects");
    expect(mocks.create).toHaveBeenCalledWith(mocks.db, "owner", brief.subscriptionId, brief.requestToken, expect.objectContaining({ editingMinutes: 120, instructions: brief.instructions }));
  });
  it("honors rate limiting before accepting a profile or project", async () => { mocks.limit.mockResolvedValue("limited"); expect(await projectAction(args("projects", brief))).toHaveProperty("error"); expect(mocks.create).not.toHaveBeenCalled(); });
  it("bounds the actual request body", async () => { expect(await projectAction(args("projects", { ...brief, instructions: "x".repeat(70000) }))).toHaveProperty("error"); expect(mocks.create).not.toHaveBeenCalled(); });
});
