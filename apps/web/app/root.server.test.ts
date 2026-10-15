import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./lib/admin-paths";

const mocks = vi.hoisted(() => ({
  db: {}, database: vi.fn(), access: vi.fn(), profile: vi.fn(), counts: vi.fn(), settings: vi.fn(),
  userSession: vi.fn(), adminSession: vi.fn(),
}));
vi.mock("./lib/db.server", () => ({ getDbFromContext: mocks.database }));
vi.mock("./lib/session.server", () => ({ getSession: mocks.userSession, getAdminSession: mocks.adminSession }));
vi.mock("./lib/admin-toolbar-access.server", () => ({ getAdminToolbarAccess: mocks.access }));
vi.mock("./lib/admin-profile.server", () => ({ getAdminProfileImage: mocks.profile }));
vi.mock("./lib/admin-navigation-counts.server", () => ({ getAdminNavigationCounts: mocks.counts }));
vi.mock("./lib/site-settings.server", () => ({ getSiteSettingsSnapshot: mocks.settings }));
vi.mock("./integrations/supabase/client.server", () => ({ getSupabaseClient: () => null, getRecaptchaSiteKey: () => "" }));
import { loader } from "./root";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const settings = {
  adminToolbarEnabled: true, searchCrawlingEnabled: true, maintenanceModeEnabled: false,
  promoBarSettings: { enabled: false, message: "" },
};
const load = (path = ADMIN_BASE_PATH) => loader({ request: new Request(`http://localhost:3002${path}`) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.database.mockReturnValue(mocks.db);
  mocks.userSession.mockResolvedValue({ get: () => undefined });
  mocks.adminSession.mockResolvedValue({ get: (key: string) => key === "adminUserId" ? "admin-id" : undefined });
  mocks.access.mockResolvedValue("verified");
  mocks.profile.mockResolvedValue(null);
  mocks.counts.mockResolvedValue({ pendingOrderCount: 3, unreadEnquiryCount: 2 });
  mocks.settings.mockResolvedValue(settings);
});

describe("fresh root admin data", () => {
  it("starts profile, badge and settings reads together after fresh authorization", async () => {
    const access = deferred<string>(), profile = deferred<null>();
    const counts = deferred<{ pendingOrderCount: number; unreadEnquiryCount: number }>();
    const configuration = deferred<typeof settings>();
    mocks.access.mockReturnValue(access.promise);
    mocks.profile.mockReturnValue(profile.promise);
    mocks.counts.mockReturnValue(counts.promise);
    mocks.settings.mockReturnValue(configuration.promise);
    const result = load();
    await vi.waitFor(() => expect(mocks.access).toHaveBeenCalledOnce());
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.counts).not.toHaveBeenCalled();
    access.resolve("verified");
    await vi.waitFor(() => {
      expect(mocks.profile).toHaveBeenCalledOnce();
      expect(mocks.counts).toHaveBeenCalledOnce();
      expect(mocks.settings).toHaveBeenCalledOnce();
    });
    profile.resolve(null);
    counts.resolve({ pendingOrderCount: 8, unreadEnquiryCount: 5 });
    configuration.resolve(settings);
    expect((await result).data).toMatchObject({ isAdminSignedIn: true, pendingOrderCount: 8, unreadEnquiryCount: 5 });
    expect(mocks.database).toHaveBeenCalledOnce();
  });

  it("rechecks access and reads changed counts on each request", async () => {
    const first = await load();
    mocks.counts.mockResolvedValueOnce({ pendingOrderCount: 0, unreadEnquiryCount: 7 });
    const next = await load();
    expect(first.data.pendingOrderCount).toBe(3);
    expect(next.data).toMatchObject({ pendingOrderCount: 0, unreadEnquiryCount: 7 });
    expect(mocks.access).toHaveBeenCalledTimes(2);
    expect(mocks.settings).toHaveBeenCalledTimes(2);
    expect(next.init?.headers).toMatchObject({ "Cache-Control": "private, no-store" });
  });

  it("skips private reads after access is revoked", async () => {
    mocks.access.mockResolvedValue("none");
    const result = await load();
    expect(result.data).toMatchObject({ isAdminSignedIn: false, adminProfile: null, pendingOrderCount: 0, unreadEnquiryCount: 0 });
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.counts).not.toHaveBeenCalled();
    expect(mocks.settings).toHaveBeenCalledWith(mocks.db, undefined, { includeAdminToolbar: false, includePromoBar: false });
  });

  it("skips badge reads on admin sign-in", async () => {
    await load(ADMIN_LOGIN_PATH);
    expect(mocks.counts).not.toHaveBeenCalled();
  });

  it("still redirects non-admin visitors during maintenance", async () => {
    mocks.access.mockResolvedValue("none");
    mocks.settings.mockResolvedValue({ ...settings, maintenanceModeEnabled: true });
    const result = await load("/portfolio").catch(response => response as Response);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/maintenance?redirectTo=%2Fportfolio");
  });
});
