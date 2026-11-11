import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), destroy: vi.fn(), getSession: vi.fn(), issueCsrf: vi.fn() }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({}) }));
vi.mock("../lib/session.server", () => ({
  getAdminSession: mocks.getSession,
  requireAdminUser: mocks.authorize,
  destroyAdminSession: mocks.destroy,
  createAdminSession: vi.fn(),
  isAdminRole: (role: string) => role === "admin",
  issueAuthCsrfToken: mocks.issueCsrf,
}));
import { loader } from "./admin-login";
async function visit() { return loader({ request: new Request("http://localhost:3002/site/node-logmin/login"), context: {}, params: {} } as Parameters<typeof loader>[0]); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ has: () => true });
  mocks.issueCsrf.mockResolvedValue({ token: "csrf-token", setCookie: "csrf-cookie" });
  mocks.destroy.mockResolvedValue("expired-admin-cookie");
});
describe("stale admin sign-in sessions", () => {
  it("sends a revoked admin session to the main sign-in page", async () => {
    mocks.authorize.mockRejectedValue(new Response(null, { status: 302, headers: { Location: "/signin?mode=signin" } }));
    const result = await visit().catch(error => error);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/signin?mode=signin");
    expect(mocks.destroy).not.toHaveBeenCalled();
  });
  it("opens the panel for a valid, authorized session", async () => {
    mocks.authorize.mockResolvedValue({ id: "admin-id", active: true, role: "admin" });
    await expect(visit()).rejects.toMatchObject({ status: 302 }); expect(mocks.destroy).not.toHaveBeenCalled();
  });
  it("does not turn a database outage into a sign-in loop", async () => {
    mocks.authorize.mockRejectedValue(new Error("database unavailable"));
    await expect(visit()).rejects.toThrow("database unavailable"); expect(mocks.destroy).not.toHaveBeenCalled();
  });
  it("shows the admin login form when there is no admin session", async () => {
    mocks.getSession.mockResolvedValue({ has: () => false });
    const result = await visit();
    expect(result).toMatchObject({ data: { csrfToken: "csrf-token" } });
    expect(mocks.authorize).not.toHaveBeenCalled();
  });
});
