import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startGoogleOAuth: vi.fn(),
  verifyRecaptchaToken: vi.fn(),
  issueAuthCsrfToken: vi.fn(),
  verifyAuthCsrfToken: vi.fn(),
}));

vi.mock("../lib/google-auth.server", () => ({ startGoogleOAuth: mocks.startGoogleOAuth }));
vi.mock("../lib/recaptcha.server", () => ({ verifyRecaptchaToken: mocks.verifyRecaptchaToken }));
vi.mock("../lib/session.server", () => ({
  issueAuthCsrfToken: mocks.issueAuthCsrfToken,
  verifyAuthCsrfToken: mocks.verifyAuthCsrfToken,
}));

import { action, loader } from "./auth-google";

function args(values: Record<string, string> = {}, url = "http://localhost:3002/auth/google") {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  const request = new Request(url, { method: "POST", body: formData, headers: { Origin: new URL(url).origin } });
  return { request, params: {}, context: {} } as Parameters<typeof action>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.issueAuthCsrfToken.mockResolvedValue({ token: "refreshed-token", setCookie: "_edicut_auth_csrf=refreshed" });
  mocks.verifyAuthCsrfToken.mockResolvedValue(true);
  mocks.verifyRecaptchaToken.mockResolvedValue({ success: true });
  mocks.startGoogleOAuth.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://accounts.google.com/" } }));
});

describe("Google OAuth GET navigation", () => {
  function get(query = "") {
    return loader({ request: new Request(`http://localhost:3002/auth/google${query}`), params: {}, context: {} } as Parameters<typeof loader>[0]);
  }

  it("redirects a direct visit to sign-in without bypassing the CAPTCHA", () => {
    const response = get();
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/signin");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.startGoogleOAuth).not.toHaveBeenCalled();
  });

  it("preserves the user's destination", () => {
    expect(get("?returnTo=%2Fdashboard%2Fprojects%3Fpage%3D2").headers.get("Location"))
      .toBe("/signin?redirectTo=%2Fdashboard%2Fprojects%3Fpage%3D2");
  });

  it("returns admins to the admin login", () => {
    expect(get("?mode=admin&returnTo=%2Fsite%2Fnode-logmin%2Fusers").headers.get("Location"))
      .toBe("/site/node-logmin/login?redirectTo=%2Fsite%2Fnode-logmin%2Fusers");
  });

  it.each(["https://example.com", "//example.com", "/\\example.com", "/\n/example.com"])
    ("discards unsafe return paths: %s", (returnTo) => {
      expect(get(`?returnTo=${encodeURIComponent(returnTo)}`).headers.get("Location")).toBe("/signin");
    });
});

describe("Google OAuth initiation", () => {
  it("starts user OAuth without requiring a CAPTCHA token", async () => {
    const result = await action(args({ mode: "user" }));

    expect(mocks.verifyRecaptchaToken).not.toHaveBeenCalled();
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Response);
  });

  it("accepts the browser-native URL-encoded OAuth form", async () => {
    const request = new Request("http://localhost:3002/auth/google", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3002",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ mode: "user", returnTo: "/dashboard" }),
    });

    await action({ request, params: {}, context: {} } as Parameters<typeof action>[0]);

    expect(mocks.verifyRecaptchaToken).not.toHaveBeenCalled();
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(mocks.startGoogleOAuth.mock.calls[0]?.[2]?.get("returnTo")).toBe("/dashboard");
  });

  it("requires CAPTCHA verification for admin OAuth", async () => {
    const result = await action(args({ mode: "admin", "g-recaptcha-response": "verified-token" }, "https://edicut.com/auth/google"));

    expect(mocks.verifyRecaptchaToken).toHaveBeenCalledWith({ context: {}, token: "verified-token" });
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Response);
  });

  it("keeps local admin OAuth testable without an external CAPTCHA token", async () => {
    const result = await action(args({ mode: "admin" }));

    expect(mocks.verifyRecaptchaToken).not.toHaveBeenCalled();
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Response);
  });

  it("returns admins to their login form when CAPTCHA verification fails", async () => {
    mocks.verifyRecaptchaToken.mockResolvedValue({ success: false, error: "Security check failed." });
    const result = await action(args({ mode: "admin", returnTo: "/site/node-logmin/users", "g-recaptcha-response": "bad-token" }, "https://edicut.com/auth/google"));

    expect((result as Response).headers.get("Location"))
      .toBe("/site/node-logmin/login?error=recaptcha&redirectTo=%2Fsite%2Fnode-logmin%2Fusers");
    expect(mocks.startGoogleOAuth).not.toHaveBeenCalled();
  });

  it("rejects an OAuth request without its form token and returns the user to sign-in", async () => {
    mocks.verifyAuthCsrfToken.mockResolvedValue(false);
    const result = await action(args({ mode: "user" }));

    expect((result as Response).status).toBe(302);
    expect((result as Response).headers.get("Location")).toBe("/signin?error=auth-request");
    expect((result as Response).headers.get("Set-Cookie")).toContain("_edicut_auth_csrf=refreshed");
    expect(mocks.startGoogleOAuth).not.toHaveBeenCalled();
  });
});
