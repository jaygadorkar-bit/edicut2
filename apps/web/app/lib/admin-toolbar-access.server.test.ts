import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
const mocks = vi.hoisted(() => ({ byId: vi.fn(), user: vi.fn(), authUser: vi.fn() }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: mocks.byId }));
vi.mock("../integrations/supabase/client.server", () => ({ getSupabaseUserByAccessToken: mocks.authUser }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.user }));
import { getAdminToolbarAccess } from "./admin-toolbar-access.server";
import { getSessionCredentialVersion } from "./session.server";
const db = {} as DatabaseClient;
const admin = { id: "admin-1", email: "owner@example.com", active: true, role: "admin" };
let version: string, userVersion: string;
beforeEach(async () => {
  version = await getSessionCredentialVersion(admin, undefined, "admin");
  userVersion = await getSessionCredentialVersion({ id: "user-1", email: admin.email });
});
beforeEach(() => { vi.clearAllMocks(); mocks.byId.mockResolvedValue(admin); mocks.user.mockResolvedValue({ id: "user-1", email: admin.email, active: true, deletedAt: null }); });
const access = (identity: Parameters<typeof getAdminToolbarAccess>[1]) => getAdminToolbarAccess(db, {
  userCredentialVersion: userVersion, adminCredentialVersion: version, verifiedUserAdminCredentialVersion: version, ...identity,
});
describe("admin toolbar identity", () => {
  it("rejects changed credentials before loading privileged root data", async () => {
    expect(await access({ userId: "user-1", verifiedUserAdminId: admin.id, userCredentialVersion: "outdated" })).toBe("none");
    mocks.byId.mockResolvedValue({ ...admin, passwordHash: "changed-password" });
    expect(await access({ adminUserId: admin.id })).toBe("none");
  });
  it("does not trust an expired or mismatched Supabase identity for private badges", async () => {
    mocks.authUser.mockResolvedValue(null);
    expect(await access({ adminUserId: admin.id, adminAccessToken: "expired-token" })).toBe("none");
    mocks.authUser.mockResolvedValue({ email: "other@example.test", email_confirmed_at: "confirmed" });
    expect(await access({ adminUserId: admin.id, adminAccessToken: "other-token" })).toBe("none");
    mocks.authUser.mockResolvedValue({ email: admin.email, email_confirmed_at: "confirmed" });
    expect(await access({ adminUserId: admin.id, adminAccessToken: "valid-token" })).toBe("verified");
  });
  it("keeps visitors out without querying account records", async () => {
    expect(await access({})).toBe("none");
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("shows the panel for a current dedicated admin identity", async () => {
    expect(await access({ adminUserId: admin.id, adminCredentialVersion: version })).toBe("verified");
  });
  it("hides admin controls from older customer sessions without admin verification", async () => {
    expect(await access({ userId: "user-1" })).toBe("none");
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.byId).not.toHaveBeenCalled();
  });
  it("opens the panel only when the verified user-session identity matches the registered admin", async () => {
    expect(await access({ userId: "user-1", verifiedUserAdminId: admin.id, verifiedUserAdminCredentialVersion: version })).toBe("verified");
    mocks.byId.mockResolvedValue({ ...admin, id: "another-admin", email: "different@example.com" });
    expect(await access({ userId: "user-1", verifiedUserAdminId: "another-admin" })).toBe("none");
  });
  it("does not show the toolbar to ordinary customers", async () => {
    expect(await access({ userId: "user-1" })).toBe("none");
  });
  it.each([{ ...admin, active: false }, { ...admin, role: "customer" }, undefined])("rejects an inactive, non-admin or missing administrator: %j", async (record) => {
    mocks.byId.mockResolvedValue(record);
    expect(await access({ adminUserId: admin.id, userId: "user-1", verifiedUserAdminId: admin.id })).toBe("none");
  });
  it("rejects inactive or deleted customer accounts", async () => {
    mocks.user.mockResolvedValue({ email: admin.email, active: false });
    expect(await access({ userId: "user-1", verifiedUserAdminId: admin.id })).toBe("none");
    mocks.user.mockResolvedValue({ email: admin.email, active: true, deletedAt: new Date() });
    expect(await access({ userId: "user-1", verifiedUserAdminId: admin.id })).toBe("none");
  });
  it("matches verified identities using normalized email addresses", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", email: " OWNER@Example.com ", active: true, deletedAt: null });
    expect(await access({ userId: "user-1", verifiedUserAdminId: admin.id, verifiedUserAdminCredentialVersion: version })).toBe("verified");
  });
  it("rejects missing workspace records for linked admin sessions", async () => {
    mocks.user.mockResolvedValue(undefined);
    expect(await access({ userId: "user-1", verifiedUserAdminId: admin.id })).toBe("none");
  });
});
