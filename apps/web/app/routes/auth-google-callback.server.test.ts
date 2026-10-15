import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn(), complete: vi.fn(), failure: vi.fn() }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.db }));
vi.mock("../lib/google-auth.server", () => ({ completeGoogleOAuth: mocks.complete, createGoogleOAuthFailureResponse: mocks.failure }));
import { loader } from "./auth-google-callback";

const request = new Request("http://localhost:3002/api/auth/callback/google?code=private-code&state=private-state");
const args = { request, params: {}, context: {} } as Parameters<typeof loader>[0];

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.db.mockReturnValue({});
  mocks.failure.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "/signin?error=google-unavailable" } }));
});
afterEach(() => vi.restoreAllMocks());

describe("Google callback failure handling", () => {
  it("preserves a successful sign-in response", async () => {
    const response = new Response(null, { status: 302, headers: { Location: "/dashboard", "Set-Cookie": "_session=authenticated" } });
    mocks.complete.mockResolvedValue(response);
    expect(await loader(args)).toBe(response);
    expect(mocks.failure).not.toHaveBeenCalled();
  });

  it("does not expose failed queries, profile data, or OAuth credentials", async () => {
    mocks.complete.mockRejectedValue(new Error('Failed query: update "users" returning "session_version"; params: private-email@example.com, private-token'));
    const response = await loader(args);
    expect(response.headers.get("Location")).toBe("/signin?error=google-unavailable");
    expect(await response.text()).toBe("");
    expect(mocks.failure).toHaveBeenCalledWith(request);
    expect(console.error).toHaveBeenCalledWith("Google sign-in could not be completed.", { status: 500 });
  });

  it("also handles database initialization failures", async () => {
    mocks.db.mockImplementation(() => { throw new Error("private connection details"); });
    expect((await loader(args)).status).toBe(302);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("returns provider outages to a fresh sign-in attempt", async () => {
    mocks.complete.mockRejectedValue(new Response("Token exchange failed", { status: 502 }));
    expect((await loader(args)).headers.get("Location")).toBe("/signin?error=google-unavailable");
    expect(console.error).toHaveBeenCalledWith("Google sign-in could not be completed.", { status: 502 });
  });

  it.each([302, 403])("preserves intentional %s responses without bypassing access controls", async status => {
    const response = new Response(null, { status });
    mocks.complete.mockRejectedValue(response);
    await expect(loader(args)).rejects.toBe(response);
    expect(mocks.failure).not.toHaveBeenCalled();
  });
});
