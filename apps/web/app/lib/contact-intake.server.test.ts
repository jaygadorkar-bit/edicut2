import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const returning = vi.fn(async () => [{ id: "contact-42" }]);
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  const db = { insert };

  return {
    db,
    insert,
    values,
    returning,
    getDbFromContext: vi.fn(() => db),
    consumeUsageLimit: vi.fn(async () => "allowed" as const),
    hashUsageLimitKey: vi.fn(async () => "hashed-email"),
    requestBodyExceedsLimit: vi.fn(() => false),
    verifyRecaptchaToken: vi.fn(async (): Promise<{ success: boolean; error?: string }> => ({ success: true })),
    queueTelegramContactInquiryNotice: vi.fn(),
  };
});

vi.mock("./db.server", () => ({ getDbFromContext: mocks.getDbFromContext }));
vi.mock("./recaptcha.server", () => ({ verifyRecaptchaToken: mocks.verifyRecaptchaToken }));
vi.mock("./usage-protection.server", () => ({
  consumeUsageLimit: mocks.consumeUsageLimit,
  hashUsageLimitKey: mocks.hashUsageLimitKey,
  requestBodyExceedsLimit: mocks.requestBodyExceedsLimit,
}));
vi.mock("./telegram-notifications.server", () => ({
  queueTelegramContactInquiryNotice: mocks.queueTelegramContactInquiryNotice,
}));

import { submitContactInquiry } from "./contact-intake.server";

function contactRequest(path = "/contact", values: Record<string, string> = {}) {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    name: "Alex Morgan",
    email: "alex@example.com",
    brief: "I need editing help for my next channel upload and would like to discuss a schedule.",
    ...values,
  })) formData.set(key, value);

  return new Request(`http://localhost:3002${path}`, { method: "POST", body: formData });
}

function getRedirectLocation(response: Response) {
  return response.headers.get("Location") || "";
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.returning.mockResolvedValue([{ id: "contact-42" }]);
  mocks.consumeUsageLimit.mockResolvedValue("allowed");
  mocks.requestBodyExceedsLimit.mockReturnValue(false);
  mocks.verifyRecaptchaToken.mockResolvedValue({ success: true });
});

describe("contact inquiry delivery", () => {
  it("rejects a malformed form body without crashing or writing data", async () => {
    const request = new Request("http://localhost:3002/contact", { method: "POST", body: "invalid", headers: { "Content-Type": "multipart/form-data" } });
    const response = await submitContactInquiry({ request, context: {}, returnTo: "/contact" });
    expect(getRedirectLocation(response)).toBe("/contact?error=invalid#contact");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.queueTelegramContactInquiryNotice).not.toHaveBeenCalled();
  });
  it("saves the inquiry for the admin inbox and queues a privacy-safe Telegram alert", async () => {
    const context = {};
    const response = await submitContactInquiry({ request: contactRequest(), context, returnTo: "/contact" });

    expect(response.status).toBe(302);
    expect(getRedirectLocation(response)).toContain("/contact?sent=1#contact");
    expect(mocks.values).toHaveBeenCalledWith({
      name: "Alex Morgan",
      email: "alex@example.com",
      projectType: null,
      monthlyVolume: null,
      message: "I need editing help for my next channel upload and would like to discuss a schedule.",
    });
    expect(mocks.returning).toHaveBeenCalledOnce();
    expect(mocks.queueTelegramContactInquiryNotice).toHaveBeenCalledWith(context, { messageId: "contact-42" });
  });

  it("supports the homepage form's confirmation URL", async () => {
    const response = await submitContactInquiry({ request: contactRequest("/"), context: {}, returnTo: "/" });

    expect(getRedirectLocation(response)).toContain("/?sent=1#contact");
    expect(mocks.queueTelegramContactInquiryNotice).toHaveBeenCalledOnce();
  });

  it("rejects invalid details before touching the inbox or Telegram", async () => {
    const response = await submitContactInquiry({
      request: contactRequest("/contact", { brief: "Too short" }),
      context: {},
      returnTo: "/contact",
    });

    expect(getRedirectLocation(response)).toContain("/contact?error=invalid#contact");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.queueTelegramContactInquiryNotice).not.toHaveBeenCalled();
  });

  it("does not save an inquiry when the security check fails", async () => {
    mocks.verifyRecaptchaToken.mockResolvedValue({ success: false, error: "Verification failed" });
    const response = await submitContactInquiry({ request: contactRequest(), context: {}, returnTo: "/contact" });

    expect(getRedirectLocation(response)).toContain("/contact?error=security#contact");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.queueTelegramContactInquiryNotice).not.toHaveBeenCalled();
  });

  it("reports a save failure and does not announce an inquiry that was not stored", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.returning.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await submitContactInquiry({ request: contactRequest(), context: {}, returnTo: "/contact" });

    expect(getRedirectLocation(response)).toContain("/contact?error=delivery#contact");
    expect(mocks.queueTelegramContactInquiryNotice).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith("Unable to save contact inquiry");
    log.mockRestore();
  });
});
