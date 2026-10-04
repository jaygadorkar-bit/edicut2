import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
}));

vi.mock("@edicut/shared/server-fetch", () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

import { isRecaptchaConfigured, verifyRecaptchaToken } from "./recaptcha.server";

function context(env: Record<string, string | undefined>) {
  return { cf: { env } };
}

const configuredEnv = {
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: "test-site-key",
  RECAPTCHA_SECRET_KEY: "test-secret",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("invisible reCAPTCHA verification", () => {
  it("requires both site and secret keys", async () => {
    expect(isRecaptchaConfigured(context(configuredEnv))).toBe(true);
    expect(isRecaptchaConfigured(context({ ...configuredEnv, RECAPTCHA_SECRET_KEY: "" }))).toBe(false);

    const result = await verifyRecaptchaToken({
      context: context({ ...configuredEnv, RECAPTCHA_SECRET_KEY: "" }),
      token: "valid-token",
    });

    expect(result).toEqual({ success: false, error: "Security check is unavailable. Please try again." });
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("rejects a missing token without calling Google", async () => {
    const result = await verifyRecaptchaToken({ context: context(configuredEnv), token: null });

    expect(result).toEqual({ success: false, error: "Security check expired. Please try again." });
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("posts the token and server secret to Google's verification endpoint", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({ success: true, hostname: "edicut.com" }), { status: 200 }));

    const result = await verifyRecaptchaToken({ context: context(configuredEnv), token: "verified-token" });
    const [url, init] = mocks.fetchWithTimeout.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(String(init.body));

    expect(result).toEqual({ success: true });
    expect(url).toBe("https://www.google.com/recaptcha/api/siteverify");
    expect(init.method).toBe("POST");
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("verified-token");
  });

  it("rejects an unsuccessful Google verification", async () => {
    mocks.fetchWithTimeout.mockResolvedValue(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 }));

    const result = await verifyRecaptchaToken({ context: context(configuredEnv), token: "invalid-token" });

    expect(result).toEqual({ success: false, error: "Security check failed. Please try again." });
  });
});
