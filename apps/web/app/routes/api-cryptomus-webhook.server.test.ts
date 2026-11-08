import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDbFromContext: vi.fn(() => ({ db: true })),
  markSubscriptionPaidByCryptomus: vi.fn(async () => true),
}));

vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.getDbFromContext }));
vi.mock("../lib/customer-subscriptions.server", () => ({ markSubscriptionPaidByCryptomus: mocks.markSubscriptionPaidByCryptomus }));

import { action, loader } from "./api-cryptomus-webhook";

const apiKey = "test-payment-key";
const invoiceUuid = "9d4d98aa-f971-4d85-9f21-2b4b2fb99360";
const orderId = "62f88b36-a9d5-4fa6-aa26-e040c3dbf26d";
const context = { cf: { env: {
  APP_URL: "https://edicut.com",
  CRYPTOMUS_MERCHANT_ID: "a68763cb-06a5-4396-b597-e9d169f4d7fc",
  CRYPTOMUS_PAYMENT_API_KEY: apiKey,
} } };

function signedBody(data: Record<string, unknown>) {
  const json = JSON.stringify(data).replace(/\//gu, "\\/");
  const sign = createHash("md5").update(`${Buffer.from(json, "utf8").toString("base64")}${apiKey}`).digest("hex");
  return JSON.stringify({ ...data, sign });
}

function request(body: string, method = "POST") {
  return new Request("https://edicut.com/api/cryptomus/webhook", {
    method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? body : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDbFromContext.mockReturnValue({ db: true });
  mocks.markSubscriptionPaidByCryptomus.mockResolvedValue(true);
});

describe("Cryptomus webhook", () => {
  it("returns a clean method response for GET probes", async () => {
    const response = await loader();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await response.json()).toEqual({ error: "Method not allowed" });
  });

  it("marks only a signed, paid, exact order callback for processing", async () => {
    const body = signedBody({
      type: "payment", uuid: invoiceUuid, order_id: orderId,
      amount: "3149.00", payment_amount_usd: "3149.00", status: "paid",
    });
    const response = await action({ request: request(body), context } as Parameters<typeof action>[0]);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(mocks.markSubscriptionPaidByCryptomus).toHaveBeenCalledWith({ db: true }, {
      id: orderId, invoiceUuid, amountCents: 314900,
    });
  });

  it("rejects forged signatures without touching the database", async () => {
    const body = signedBody({ type: "payment", uuid: invoiceUuid, order_id: orderId, status: "paid", payment_amount_usd: "10.00" })
      .replace(/"sign":"[a-f0-9]{32}"/u, `"sign":"${"0".repeat(32)}"`);
    const response = await action({ request: request(body), context } as Parameters<typeof action>[0]);

    expect(response.status).toBe(401);
    expect(mocks.markSubscriptionPaidByCryptomus).not.toHaveBeenCalled();
  });

  it("acknowledges valid non-paid events without changing order status", async () => {
    const body = signedBody({ type: "payment", uuid: invoiceUuid, order_id: orderId, status: "check" });
    const response = await action({ request: request(body), context } as Parameters<typeof action>[0]);

    expect(response.status).toBe(200);
    expect(mocks.markSubscriptionPaidByCryptomus).not.toHaveBeenCalled();
  });

  it("rejects methods other than POST", async () => {
    const response = await action({ request: request("", "GET"), context } as Parameters<typeof action>[0]);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("rejects oversized bodies before signature or database processing", async () => {
    const response = await action({ request: request("x".repeat(32 * 1024 + 1)), context } as Parameters<typeof action>[0]);

    expect(response.status).toBe(413);
    expect(mocks.markSubscriptionPaidByCryptomus).not.toHaveBeenCalled();
  });
});
