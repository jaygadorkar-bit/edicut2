import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), findFirst: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn(), limit: vi.fn(), photo: vi.fn(), email: vi.fn(), password: vi.fn() }));
const db = { query: { adminUsers: { findFirst: mocks.findFirst } }, update: mocks.update };
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => db }));
vi.mock("../lib/session.server", () => ({ requireAdminUser: mocks.actor, isAdminRole: (role: string) => role === "admin" }));
vi.mock("../lib/admin-profile.server", () => ({ getAdminProfileImage: mocks.photo }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.limit, requestBodyExceedsLimit: () => false }));
vi.mock("../integrations/supabase/client.server", () => ({ updateSupabaseUserEmailByEmail: mocks.email, updateSupabaseUserPasswordByEmail: mocks.password }));
import { action, loader } from "./admin-staff";
const actor = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", email: "owner@example.test", name: "Owner", active: true, role: "admin", passwordHash: "secret-owner" };
const target = { ...actor, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", email: "staff@example.test", name: "Staff", passwordHash: "secret-target" };
function args(fields: Record<string, string> = {}, origin = "https://edicut.test") {
  const url = `https://edicut.test/site/node-logmin/admins/${target.id}?returnTo=%2Fsite%2Fnode-logmin%3Ftab%3Dusers%26view%3Dadmins`;
  return { request: new Request(url, { method: "POST", headers: { Origin: origin }, body: new URLSearchParams(fields) }), url: new URL(url), pattern: "/site/node-logmin/admins/:adminId", context: {}, params: { adminId: target.id } } as Parameters<typeof action>[0];
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.actor.mockResolvedValue(actor); mocks.findFirst.mockResolvedValue(target); mocks.limit.mockResolvedValue("allowed"); mocks.photo.mockResolvedValue(null);
  mocks.update.mockReturnValue({ set: mocks.set }); mocks.set.mockReturnValue({ where: mocks.where }); mocks.where.mockResolvedValue(undefined);
  mocks.email.mockResolvedValue(false); mocks.password.mockResolvedValue(false);
});
describe("admin directory editing", () => {
  it("returns the selected admin without credential hashes and retains the directory filters", async () => {
    const result = await loader(args() as Parameters<typeof loader>[0]);
    expect(result.target.id).toBe(target.id); expect(result.target).not.toHaveProperty("passwordHash"); expect(result.actor).not.toHaveProperty("passwordHash");
    expect(result.returnTo).toBe("/site/node-logmin?tab=users&view=admins");
  });
  it("updates the selected admin's profile while ignoring forged roles", async () => {
    expect(await action(args({ intent: "save-profile", name: "Updated staff", email: target.email, phone: "+12025550123", active: "on", role: "customer" }))).toEqual({ success: "Admin account updated." });
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ name: "Updated staff", email: target.email, active: true }));
    expect(mocks.set.mock.calls[0][0]).not.toHaveProperty("role");
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("rejects cross-site requests before authenticating", async () => {
    expect((await action(args({}, "https://attacker.test")) as Response).status).toBe(403);
    expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("denies non-admins and rate-limited requests", async () => {
    mocks.actor.mockResolvedValue({ ...actor, role: "customer" });
    expect(await action(args())).toEqual({ error: "Permission denied." }); expect(mocks.findFirst).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue(actor); mocks.limit.mockResolvedValue("limited");
    expect(await action(args())).toHaveProperty("error"); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects invalid and missing target records", async () => {
    await expect(loader({ ...args(), params: { adminId: "not-an-id" } } as Parameters<typeof loader>[0])).rejects.toMatchObject({ status: 404 });
    mocks.findFirst.mockResolvedValue(null);
    await expect(action(args())).rejects.toMatchObject({ status: 404 });
  });
  it("blocks disabling the current admin and resetting their password without current-password verification", async () => {
    mocks.actor.mockResolvedValue(target);
    expect(await action(args({ intent: "save-profile", email: target.email }))).toHaveProperty("error", "You cannot disable the admin account you are using.");
    expect(await action(args({ intent: "reset-password", password: "NewPassword123!", confirmPassword: "NewPassword123!" }))).toHaveProperty("error", expect.stringContaining("current password"));
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.password).not.toHaveBeenCalled();
  });
  it("enforces admin password strength and keeps the local hash unchanged when Auth fails", async () => {
    expect(await action(args({ intent: "reset-password", password: "short", confirmPassword: "short" }))).toHaveProperty("error", expect.stringContaining("12"));
    expect(await action(args({ intent: "reset-password", password: "StrongPassword123!", confirmPassword: "different" }))).toEqual({ error: "Passwords do not match." });
    mocks.password.mockRejectedValue(new Error("Auth unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await action(args({ intent: "reset-password", password: "StrongPassword123!", confirmPassword: "StrongPassword123!" }))).toHaveProperty("error");
    expect(mocks.update).not.toHaveBeenCalled(); log.mockRestore();
  });
  it("syncs a selected admin's password with Auth and the local fallback", async () => {
    expect(await action(args({ intent: "reset-password", password: "StrongPassword123!", confirmPassword: "StrongPassword123!" }))).toEqual({ success: "Admin password reset." });
    expect(mocks.password).toHaveBeenCalledWith({}, target.email, "StrongPassword123!");
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ passwordHash: expect.stringMatching(/^\$2[aby]\$/) }));
  });
  it("rejects duplicate admin emails and never updates locally after an Auth email failure", async () => {
    mocks.findFirst.mockResolvedValueOnce(target).mockResolvedValueOnce({ id: actor.id });
    expect(await action(args({ intent: "save-profile", email: actor.email, active: "on" }))).toEqual({ error: "Another admin already uses that email." });
    expect(mocks.email).not.toHaveBeenCalled();
    mocks.findFirst.mockResolvedValueOnce(target).mockResolvedValueOnce(null); mocks.email.mockRejectedValue(new Error("Auth unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await action(args({ intent: "save-profile", email: "new@example.test", active: "on" }))).toHaveProperty("error");
    expect(mocks.update).not.toHaveBeenCalled(); log.mockRestore();
  });
});
