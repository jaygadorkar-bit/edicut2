import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDbFromContext: vi.fn(() => ({ db: true })),
  requireAdminUser: vi.fn(),
  getAdminSession: vi.fn(() => ({})),
  commitAdminSession: vi.fn(async () => "admin-cookie=ok"),
  consumeUsageLimit: vi.fn(async () => "allowed"),
  isCryptomusTestWebhookEnabled: vi.fn(() => true),
  sendCryptomusTestWebhook: vi.fn(async () => undefined),
}));

vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.getDbFromContext }));
vi.mock("../lib/session.server", () => ({
  getAdminSession: mocks.getAdminSession,
  requireAdminUser: mocks.requireAdminUser,
  commitAdminSession: mocks.commitAdminSession,
}));
vi.mock("../lib/usage-protection.server", () => ({
  consumeUsageLimit: mocks.consumeUsageLimit,
  requestBodyExceedsLimit: () => false,
}));
vi.mock("../lib/cryptomus.server", () => ({
  isCryptomusTestWebhookEnabled: mocks.isCryptomusTestWebhookEnabled,
  sendCryptomusTestWebhook: mocks.sendCryptomusTestWebhook,
}));

import { action, loader } from "./admin-cryptomus-test";

const admin = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Test Admin", email: "admin@example.com" };
const url = "https://staging.edicut.test/site/node-logmin/cryptomus-test";
const context = { env: {} };

function actionArgs(fields: Record<string, string>, headers: Record<string, string> = {}) {
  const request = new Request(url, {
    method: "POST",
    headers: { Origin: new URL(url).origin, "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields),
  });
  return { request, context, params: {}, url: new URL(url), pattern: "/site/node-logmin/cryptomus-test" } as Parameters<typeof action>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDbFromContext.mockReturnValue({ db: true });
  mocks.requireAdminUser.mockResolvedValue(admin);
  mocks.consumeUsageLimit.mockResolvedValue("allowed");
  mocks.isCryptomusTestWebhookEnabled.mockReturnValue(true);
  mocks.sendCryptomusTestWebhook.mockResolvedValue(undefined);
});

describe("admin Cryptomus test webhook page", () => {
  it("requires the admin session and reports only whether test mode is enabled", async () => {
    const result = await loader({ request: new Request(url), context, params: {}, url: new URL(url), pattern: url } as Parameters<typeof loader>[0]);

    expect(new Headers(result.init?.headers).get("Cache-Control")).toBe("no-store");
    expect(new Headers(result.init?.headers).get("Set-Cookie")).toBe("admin-cookie=ok");
    expect(result.data).toMatchObject({ testWebhookEnabled: true, adminUser: { email: admin.email } });
    expect(mocks.requireAdminUser).toHaveBeenCalledWith(expect.any(Request), { db: true }, context, new URL(url).pathname);
  });

  it("sends the requested signed test status using server-side provider config", async () => {
    const result = await action(actionArgs({ intent: "send-test-webhook", currency: "eth", network: "ETH", status: "paid" }));

    expect(result).toEqual({ success: expect.stringContaining("accepted the paid test webhook") });
    expect(mocks.sendCryptomusTestWebhook).toHaveBeenCalledWith({
      context, currency: "ETH", network: "eth", status: "paid",
    });
    expect(mocks.consumeUsageLimit).toHaveBeenCalledWith(expect.objectContaining({ localLimit: 5 }));
  });

  it("does not send when disabled, invalid, or cross-site", async () => {
    mocks.isCryptomusTestWebhookEnabled.mockReturnValue(false);
    expect(await action(actionArgs({ intent: "send-test-webhook", currency: "ETH", network: "eth", status: "paid" })))
      .toMatchObject({ error: expect.stringContaining("disabled") });

    mocks.isCryptomusTestWebhookEnabled.mockReturnValue(true);
    expect(await action(actionArgs({ intent: "send-test-webhook", currency: "ETH", network: "eth", status: "not-a-status" })))
      .toMatchObject({ error: expect.stringContaining("valid currency") });
    expect(await action(actionArgs({ intent: "send-test-webhook", currency: "ETH", network: "eth", status: "paid" }, { Origin: "https://evil.example" })))
      .toHaveProperty("status", 403);
    expect(mocks.sendCryptomusTestWebhook).not.toHaveBeenCalled();
  });

  it("surfaces provider failures without returning provider details", async () => {
    mocks.sendCryptomusTestWebhook.mockRejectedValue(new Error("secret provider response"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await action(actionArgs({ intent: "send-test-webhook", currency: "ETH", network: "eth", status: "paid" }));

    expect(result).toMatchObject({ error: expect.stringContaining("did not accept") });
    expect(JSON.stringify(result)).not.toContain("secret provider response");
    errorSpy.mockRestore();
  });
});
