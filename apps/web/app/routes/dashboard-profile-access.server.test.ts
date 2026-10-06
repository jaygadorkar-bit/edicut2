import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ROLE_FEATURE_ACCESS } from "../lib/role-feature-access";

const mocks = vi.hoisted(() => {
  const user = {
    id: "customer-1",
    name: "Client",
    email: "client@example.com",
    role: "customer",
    active: true,
    deletedAt: null as Date | null,
    passwordHash: "server-only",
    phone: null,
    profileImageUrl: null,
  };
  const returning = vi.fn(async () => [user]);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const db = { update };
  return {
    user,
    returning,
    where,
    set,
    update,
    db,
    access: {} as Record<string, string[]>,
    requireUserId: vi.fn(async () => "customer-1"),
    findUserById: vi.fn(async () => user),
    getRoleFeatureAccessSettings: vi.fn(async () => mocks.access),
    consumeUsageLimit: vi.fn(async () => "allowed"),
    loadClientWorkspace: vi.fn(async () => ({ profile: null as unknown, purchases: [] as unknown[] })),
    saveCreatorProfile: vi.fn(async () => true),
  };
});

vi.mock("../lib/db.server", () => ({ getDbFromContext: () => mocks.db }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.findUserById }));
vi.mock("../lib/session.server", () => ({
  requireUserId: mocks.requireUserId,
  getSession: vi.fn(),
  destroySession: vi.fn(),
}));
vi.mock("../lib/site-settings.server", () => ({ getRoleFeatureAccessSettings: mocks.getRoleFeatureAccessSettings }));
vi.mock("../lib/usage-protection.server", () => ({
  consumeUsageLimit: mocks.consumeUsageLimit,
  requestBodyExceedsLimit: () => false,
}));
vi.mock("../lib/client-workspace.server", () => ({
  loadClientWorkspace: mocks.loadClientWorkspace,
  saveCreatorProfile: mocks.saveCreatorProfile,
  isMissingClientWorkspaceSchema: () => false,
}));

import { action, loader } from "./dashboard-profile";

function loaderArgs() {
  return {
    request: new Request("http://localhost:3002/dashboard/profile"),
    params: {},
    context: {},
  } as Parameters<typeof loader>[0];
}

function actionArgs(values: Record<string, string> = { intent: "save-profile", name: "Updated client", phone: "" }) {
  const body = new URLSearchParams(values);
  return {
    request: new Request("http://localhost:3002/dashboard/profile", { method: "POST", body }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = {
    ...DEFAULT_ROLE_FEATURE_ACCESS,
    customer: ["overview"],
  };
});

describe("customer profile settings access", () => {
  it("does not serialize credentials when Settings is enabled", async () => {
    mocks.access = DEFAULT_ROLE_FEATURE_ACCESS;
    expect((await loader(loaderArgs())).user).not.toHaveProperty("passwordHash");
  });
  it.each([{ active: false }, { deletedAt: new Date() }])("blocks disabled or trashed profiles: %j", async change => {
    mocks.findUserById.mockResolvedValueOnce({ ...mocks.user, ...change });
    await expect(loader(loaderArgs())).rejects.toMatchObject({ status: 302 });
    expect(mocks.getRoleFeatureAccessSettings).not.toHaveBeenCalled();
    mocks.findUserById.mockResolvedValueOnce({ ...mocks.user, ...change });
    await expect(action(actionArgs())).rejects.toMatchObject({ status: 302 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("redirects direct profile visits when Settings is disabled", async () => {
    await expect(loader(loaderArgs())).rejects.toMatchObject({
      status: 302,
      headers: expect.any(Headers),
    });
  });

  it("blocks profile writes before rate limiting or database updates when Settings is disabled", async () => {
    await expect(action(actionArgs())).rejects.toMatchObject({ status: 302 });

    expect(mocks.consumeUsageLimit).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves a profile when Settings is enabled", async () => {
    mocks.access.customer = ["overview", "settings"];

    await expect(action(actionArgs())).resolves.toMatchObject({ success: expect.any(String) });
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ name: "Updated client", phone: null }));
  });

  it("loads the purchased channel profile alongside account details", async () => {
    mocks.access = DEFAULT_ROLE_FEATURE_ACCESS;
    const channelProfile = { channelName: "QA Channel", channelUrl: "https://www.youtube.com/@qa", brandUrl: "" };
    mocks.loadClientWorkspace.mockResolvedValueOnce({ profile: channelProfile, purchases: [{ id: "paid" }] });

    await expect(loader(loaderArgs())).resolves.toMatchObject({ channelProfile, channelSchemaReady: true, hasConfirmedPurchase: true });
  });

  it("saves channel details through the Profile page", async () => {
    mocks.access = DEFAULT_ROLE_FEATURE_ACCESS;

    await expect(action(actionArgs({ intent: "save-channel", channelName: "QA Channel", channelUrl: "https://www.youtube.com/@qa", brandUrl: "" })))
      .resolves.toMatchObject({ channelSuccess: expect.any(String) });
    expect(mocks.saveCreatorProfile).toHaveBeenCalledWith(mocks.db, "customer-1", {
      channelName: "QA Channel", platform: "YouTube", channelUrl: "https://www.youtube.com/@qa", brandUrl: "",
    });
  });
});
