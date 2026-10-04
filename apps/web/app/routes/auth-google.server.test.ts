import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startGoogleOAuth: vi.fn(),
  verifyRecaptchaToken: vi.fn(),
  isSameSiteMutation: vi.fn(),
}));

vi.mock("../lib/google-auth.server", () => ({ startGoogleOAuth: mocks.startGoogleOAuth }));
vi.mock("../lib/recaptcha.server", () => ({ verifyRecaptchaToken: mocks.verifyRecaptchaToken }));
vi.mock("../lib/customer-subscriptions.server", () => ({ isSameSiteMutation: mocks.isSameSiteMutation }));

import { action } from "./auth-google";

function args(values: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  const request = new Request("http://localhost:3002/auth/google", { method: "POST", body: formData, headers: { Origin: "http://localhost:3002" } });
  return { request, params: {}, context: {} } as Parameters<typeof action>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isSameSiteMutation.mockReturnValue(true);
  mocks.verifyRecaptchaToken.mockResolvedValue({ success: true });
  mocks.startGoogleOAuth.mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://accounts.google.com/" } }));
});

describe("Google OAuth reCAPTCHA gate", () => {
  it("verifies the CAPTCHA before starting the OAuth redirect", async () => {
    const result = await action(args({ mode: "user", "g-recaptcha-response": "verified-token" }));

    expect(mocks.verifyRecaptchaToken).toHaveBeenCalledWith({ context: {}, token: "verified-token" });
    expect(mocks.startGoogleOAuth).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Response);
  });

  it("returns to the appropriate login page when CAPTCHA verification fails", async () => {
    mocks.verifyRecaptchaToken.mockResolvedValue({ success: false, error: "Security check failed." });
    const result = await action(args({ mode: "admin", returnTo: "/site/node-logmin/users", "g-recaptcha-response": "bad-token" }));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/site/node-logmin/login?error=recaptcha&redirectTo=%2Fsite%2Fnode-logmin%2Fusers");
    expect(mocks.startGoogleOAuth).not.toHaveBeenCalled();
  });

  it("blocks cross-site OAuth initiation", async () => {
    mocks.isSameSiteMutation.mockReturnValue(false);
    const result = await action(args({ mode: "user", "g-recaptcha-response": "verified-token" }));

    expect((result as Response).status).toBe(403);
    expect(mocks.verifyRecaptchaToken).not.toHaveBeenCalled();
    expect(mocks.startGoogleOAuth).not.toHaveBeenCalled();
  });
});
