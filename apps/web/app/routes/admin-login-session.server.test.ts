import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), destroy: vi.fn() }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({}) }));
vi.mock("../lib/session.server", () => ({ getAdminSession: async () => ({ has: () => true }), requireAdminUser: mocks.authorize, destroyAdminSession: mocks.destroy, createAdminSession: vi.fn(), isAdminRole: (role: string) => role === "admin" }));
import { loader } from "./admin-login";
async function visit() { return loader({ request: new Request("http://localhost:3002/site/node-logmin/login"), context: {}, params: {} } as Parameters<typeof loader>[0]); }
beforeEach(() => { vi.clearAllMocks(); mocks.destroy.mockResolvedValue("expired-admin-cookie"); });
describe("stale admin sign-in sessions", () => {
  it("clears a revoked session rather than looping between sign-in and the panel", async () => {
    mocks.authorize.mockRejectedValue(new Response(null, { status: 302, headers: { Location: "/site/node-logmin/login" } }));
    try { await visit(); throw new Error("Expected redirect"); }
    catch (error) { expect((error as Response).headers.get("Location")).toBe("/signin?redirectTo=%2Fdashboard"); expect((error as Response).headers.get("Set-Cookie")).toBe("expired-admin-cookie"); }
  });
  it("opens the panel for a valid, authorized session", async () => {
    mocks.authorize.mockResolvedValue({ id: "admin-id", active: true, role: "admin" });
    await expect(visit()).rejects.toMatchObject({ status: 302 }); expect(mocks.destroy).not.toHaveBeenCalled();
  });
  it("does not turn a database outage into a sign-in loop", async () => {
    mocks.authorize.mockRejectedValue(new Error("database unavailable"));
    await expect(visit()).rejects.toThrow("database unavailable"); expect(mocks.destroy).not.toHaveBeenCalled();
  });
});
