import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ markSubscriptionPaid: vi.fn() }));
vi.mock("../lib/customer-subscriptions.server", () => ({ markSubscriptionPaidByCryptomus: mocks.markSubscriptionPaid }));

import { action, loader } from "./api-cryptomus-test-webhook";

const apiKey = "test-payment-key";
const callback = "https://staging.edicut.test/api/cryptomus/test-webhook";
const context = { env: {
  APP_ENV: "staging",
  APP_URL: "https://staging.edicut.test",
  CRYPTOMUS_MERCHANT_ID: "a68763cb-06a5-4396-b597-e9d169f4d7fc",
  CRYPTOMUS_PAYMENT_API_KEY: apiKey,
  CRYPTOMUS_TEST_WEBHOOK_ENABLED: "true",
  CRYPTOMUS_TEST_WEBHOOK_CALLBACK_URL: callback,
} };

function signedBody(data: Record<string, unknown>) {
  const json = JSON.stringify(data).replace(/\//gu, "\\/");
  const sign = createHash("md5").update(`${Buffer.from(json, "utf8").toString("base64")}${apiKey}`).digest("hex");
  return JSON.stringify({ ...data, sign });
}

function request(body: string, method = "POST") {
  return new Request(callback, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? body : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("Cryptomus test webhook receiver", () => {
  it("accepts a valid signed test callback and never marks a subscription paid", async () => {
    const body = signedBody({
      type: "payment", uuid: "test-invoice", order_id: "test-order",
      currency: "ETH", network: "eth", status: "paid",
    });
    const response = await action({ request: request(body), context } as Parameters<typeof action>[0]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, test: true, status: "paid" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled();
  });

  it("rejects unsigned and invalid payloads", async () => {
    const unsigned = await action({ request: request(JSON.stringify({ type: "payment", status: "paid" })), context } as Parameters<typeof action>[0]);
    const invalid = await action({ request: request(signedBody({ type: "payment", status: "not-a-status", currency: "ETH", network: "eth" })), context } as Parameters<typeof action>[0]);

    expect(unsigned.status).toBe(401);
    expect(invalid.status).toBe(400);
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled();
  });

  it("keeps the test callback endpoint disabled unless explicitly configured", async () => {
    const disabledContext = { env: { ...context.env, CRYPTOMUS_TEST_WEBHOOK_ENABLED: "false" } };
    const response = await action({ request: request(signedBody({})), context: disabledContext } as Parameters<typeof action>[0]);

    expect(response.status).toBe(404);
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled();
  });

  it("returns an unavailable response for invalid gateway configuration", async () => {
    const invalidContext = { env: { ...context.env, CRYPTOMUS_MERCHANT_ID: "invalid-merchant-id" } };
    const response = await action({ request: request(signedBody({})), context: invalidContext } as Parameters<typeof action>[0]);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Payment gateway is unavailable" });
    expect(mocks.markSubscriptionPaid).not.toHaveBeenCalled();
  });

  it("provides a method response for GET probes", async () => {
    const response = await loader();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});
