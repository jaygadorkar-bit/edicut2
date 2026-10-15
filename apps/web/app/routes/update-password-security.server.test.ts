import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ updateUser: vi.fn(), setSession: vi.fn(), exchange: vi.fn(), update: vi.fn(), hash: vi.fn(), writes: [] as Array<{ table: unknown; values?: unknown; filter?: unknown }> }));
vi.mock("../integrations/supabase/client.server", () => ({ getSupabaseClient: () => ({ auth: { updateUser: mocks.updateUser, setSession: mocks.setSession, exchangeCodeForSession: mocks.exchange } }) }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: async () => "allowed", hashUsageLimitKey: async () => "test-key", requestBodyExceedsLimit: () => false }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({ update: mocks.update }) }));
import { adminUsers, users } from "@edicut/db/schema";
import { PgDialect } from "drizzle-orm/pg-core";
import { action } from "./update-password";

const identity = { id: "auth-user", email: "recovered@example.test", email_confirmed_at: "2026-10-01" };
function args(password = "NewSecurePassword123!", extras: Record<string, string> = {}) {
  return { request: new Request("https://edicut.com/update-password", { method: "POST", headers: { Origin: "https://edicut.com" }, body: new URLSearchParams({ password, confirmPassword: password, accessToken: "trusted-recovery-token", refreshToken: "recovery-refresh", ...extras }) }), context: {}, params: {} } as Parameters<typeof action>[0];
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.writes.length = 0;
  mocks.hash.mockResolvedValue("new-password-hash");
  mocks.updateUser.mockResolvedValue({ data: { user: identity }, error: null });
  mocks.setSession.mockResolvedValue({ error: null });
  mocks.update.mockImplementation(table => ({ set: (values: unknown) => ({ where: async (filter: unknown) => { mocks.writes.push({ table, values, filter }); } }) }));
});
describe("password recovery credential revocation", () => {
  it("updates both application credential stores using only the provider-verified identity", async () => {
    await expect(action(args(undefined, { email: "victim@example.test", userId: "victim" }))).rejects.toMatchObject({ status: 302 });
    expect(mocks.writes.map(write => write.table)).toEqual([users, adminUsers]);
    for (const write of mocks.writes) {
      expect(write.values).toMatchObject({ passwordHash: "new-password-hash" });
      expect(new PgDialect().sqlToQuery(write.filter as Parameters<PgDialect["sqlToQuery"]>[0]).params).toEqual([identity.email]);
    }
    expect(mocks.hash).toHaveBeenCalledWith("NewSecurePassword123!", 12);
  });
  it("does not report success if application credential revocation fails", async () => {
    mocks.update.mockImplementation(() => { throw new Error("database unavailable"); });
    expect(await action(args())).toHaveProperty("error");
  });
  it("never updates application credentials after a provider rejection", async () => {
    mocks.updateUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid recovery" } });
    expect(await action(args())).toHaveProperty("error");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["short", "a".repeat(73), "বাংলা".repeat(8)])("rejects weak or bcrypt-truncated new passwords before contacting Auth", async password => {
    expect(await action(args(password))).toHaveProperty("error");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});
