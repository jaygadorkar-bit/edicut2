import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@edicut/db/client";
const mocks = vi.hoisted(() => ({ session: new Map<string, unknown>(), adminSession: new Map<string, unknown>(), admin: vi.fn(), user: vi.fn(), requireAdmin: vi.fn(), requireUser: vi.fn() }));
vi.mock("@edicut/db/repositories/admin-users", () => ({ findAdminUserById: mocks.admin }));
vi.mock("@edicut/db/repositories/users", () => ({ findUserById: mocks.user }));
vi.mock("./session.server", () => ({ getSession: async () => mocks.session, getAdminSession: async () => mocks.adminSession, requireAdminUser: mocks.requireAdmin, requireUserId: mocks.requireUser, destroySession: async () => "expired", isAdminRole: (role: string) => role === "admin" }));
vi.mock("./site-settings.server", () => ({ getRoleFeatureAccessSettings: async () => ({}) }));
import { requireContactInboxAccess } from "./contact-inbox-access.server";
const request = new Request("http://localhost:3002/dashboard/messages");
const db = {} as DatabaseClient;
const admin = { id: "admin-1", email: "owner@example.com", name: "Owner", active: true, role: "admin" };
const user = { id: "user-1", email: admin.email, name: "Owner", role: "customer", active: true, deletedAt: null };
beforeEach(() => { vi.clearAllMocks(); mocks.session.clear(); mocks.adminSession.clear(); mocks.user.mockResolvedValue(user); mocks.admin.mockResolvedValue(admin); mocks.requireUser.mockResolvedValue(user.id); mocks.requireAdmin.mockResolvedValue(admin); });
describe("contact inbox authorization", () => {
  it("allows dedicated administrators without requiring a separate customer session", async () => {
    mocks.adminSession.set("adminUserId", admin.id);
    expect(await requireContactInboxAccess(request, db)).toMatchObject({ user: { role: "admin" }, allowedFeatures: ["support"] });
    expect(mocks.requireAdmin).toHaveBeenCalledWith(request, db, undefined);
    expect(mocks.requireUser).not.toHaveBeenCalled();
  });
  it("propagates failed dedicated admin verification", async () => {
    mocks.adminSession.set("adminUserId", admin.id);
    const rejection = new Response(null, { status: 302, headers: { Location: "/admin-login" } });
    mocks.requireAdmin.mockRejectedValueOnce(rejection);
    await expect(requireContactInboxAccess(request, db)).rejects.toBe(rejection);
  });
  it("allows a verified admin using the matching customer workspace", async () => {
    mocks.session.set("adminUserId", admin.id); mocks.session.set("adminAccessVerified", true);
    expect(await requireContactInboxAccess(request, db)).toMatchObject({ user: { role: "admin" }, allowedFeatures: expect.arrayContaining(["support"]) });
  });
  it.each([{ ...admin, active: false }, { ...admin, role: "customer" }, { ...admin, email: "different@example.com" }, undefined])("denies an invalid linked admin: %j", async (record) => {
    mocks.admin.mockResolvedValue(record); mocks.session.set("adminUserId", admin.id); mocks.session.set("adminAccessVerified", true);
    await expect(requireContactInboxAccess(request, db)).rejects.toMatchObject({ status: 302 });
  });
  it("denies customers even when their email belongs to an administrator but is not verified", async () => {
    mocks.session.set("adminUserId", admin.id);
    await expect(requireContactInboxAccess(request, db)).rejects.toMatchObject({ status: 302 });
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("preserves support staff access", async () => {
    mocks.user.mockResolvedValue({ ...user, role: "customer_support" });
    expect(await requireContactInboxAccess(request, db)).toMatchObject({ user: { role: "customer_support" }, allowedFeatures: expect.arrayContaining(["support"]) });
  });
  it("rejects disabled users before reading any enquiries", async () => {
    mocks.user.mockResolvedValue({ ...user, active: false, role: "customer_support" });
    await expect(requireContactInboxAccess(request, db)).rejects.toMatchObject({ status: 302 });
  });
});
