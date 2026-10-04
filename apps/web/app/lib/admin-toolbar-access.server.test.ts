import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
const mocks = vi.hoisted(() => ({ byId: vi.fn(), user: vi.fn() }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: mocks.byId }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.user }));
import { getAdminToolbarAccess } from "./admin-toolbar-access.server";
const db = {} as DatabaseClient;
const admin = { id: "admin-1", email: "owner@example.com", active: true, role: "admin" };
beforeEach(() => { vi.clearAllMocks(); mocks.byId.mockResolvedValue(admin); mocks.user.mockResolvedValue({ id: "user-1", email: admin.email, active: true, deletedAt: null }); });
describe("admin toolbar identity", () => {
  it("keeps visitors out without querying account records", async () => {
    expect(await getAdminToolbarAccess(db, {})).toBe("none");
    expect(mocks.user).not.toHaveBeenCalled();
  });
  it("shows the panel for a current dedicated admin identity", async () => {
    expect(await getAdminToolbarAccess(db, { adminUserId: admin.id })).toBe("verified");
  });
  it("hides admin controls from older customer sessions without admin verification", async () => {
    expect(await getAdminToolbarAccess(db, { userId: "user-1" })).toBe("none");
    expect(mocks.user).not.toHaveBeenCalled();
    expect(mocks.byId).not.toHaveBeenCalled();
  });
  it("opens the panel only when the verified user-session identity matches the registered admin", async () => {
    expect(await getAdminToolbarAccess(db, { userId: "user-1", verifiedUserAdminId: admin.id })).toBe("verified");
    mocks.byId.mockResolvedValue({ ...admin, id: "another-admin", email: "different@example.com" });
    expect(await getAdminToolbarAccess(db, { userId: "user-1", verifiedUserAdminId: "another-admin" })).toBe("none");
  });
  it("does not show the toolbar to ordinary customers", async () => {
    expect(await getAdminToolbarAccess(db, { userId: "user-1" })).toBe("none");
  });
  it.each([{ ...admin, active: false }, { ...admin, role: "customer" }, undefined])("rejects an inactive, non-admin or missing administrator: %j", async (record) => {
    mocks.byId.mockResolvedValue(record);
    expect(await getAdminToolbarAccess(db, { adminUserId: admin.id, userId: "user-1", verifiedUserAdminId: admin.id })).toBe("none");
  });
  it("rejects inactive or deleted customer accounts", async () => {
    mocks.user.mockResolvedValue({ email: admin.email, active: false });
    expect(await getAdminToolbarAccess(db, { userId: "user-1", verifiedUserAdminId: admin.id })).toBe("none");
    mocks.user.mockResolvedValue({ email: admin.email, active: true, deletedAt: new Date() });
    expect(await getAdminToolbarAccess(db, { userId: "user-1", verifiedUserAdminId: admin.id })).toBe("none");
  });
  it("matches verified identities using normalized email addresses", async () => {
    mocks.user.mockResolvedValue({ email: " OWNER@Example.com ", active: true, deletedAt: null });
    expect(await getAdminToolbarAccess(db, { userId: "user-1", verifiedUserAdminId: admin.id })).toBe("verified");
  });
  it("rejects missing workspace records for linked admin sessions", async () => {
    mocks.user.mockResolvedValue(undefined);
    expect(await getAdminToolbarAccess(db, { userId: "user-1", verifiedUserAdminId: admin.id })).toBe("none");
  });
});
