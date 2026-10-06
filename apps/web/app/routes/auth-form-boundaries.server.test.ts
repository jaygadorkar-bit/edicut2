import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn() }));
vi.mock("../integrations/supabase/client.server", () => ({ getSupabaseClient: mocks.client }));
import { action as forgotPassword } from "./forgot-password";
import { action as updatePassword } from "./update-password";
import { action as adminLogin } from "./admin-login";
describe.each([["forgot-password", forgotPassword], ["update-password", updatePassword], ["admin-login", adminLogin]] as const)("%s form boundaries", (path, action) => {
  it("rejects cross-site submissions before contacting an identity provider", async () => {
    mocks.client.mockClear();
    const request = new Request(`http://localhost:3002/${path}`, { method: "POST", headers: { Origin: "https://other.example" }, body: new URLSearchParams({ email: "client@example.com", password: "test-password" }) });
    const result = await action({ request, context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result instanceof Response ? result.status : result.error).toBe(path === "admin-login" ? "Admin request origin was rejected." : 403);
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("handles malformed multipart forms without an exception", async () => {
    const request = new Request(`http://localhost:3002/${path}`, { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=invalid" }, body: "malformed" });
    const result = await action({ request, context: {}, params: {} } as Parameters<typeof action>[0]);
    expect(result).toHaveProperty("error");
  });
});
