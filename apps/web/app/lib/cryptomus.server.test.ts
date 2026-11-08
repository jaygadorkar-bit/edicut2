import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCryptomusInvoice,
  getCryptomusConfig,
  getCryptomusTestWebhookCallbackUrl,
  isCryptomusTestWebhookEnabled,
  isCryptomusPaymentUrl,
  parseCryptomusPaidWebhook,
  sendCryptomusTestWebhook,
  verifyCryptomusWebhook,
} from "./cryptomus.server";
import { isActiveCryptomusInvoice } from "./cryptomus";

const merchantId = "a68763cb-06a5-4396-b597-e9d169f4d7fc";
const apiKey = "test-payment-key";
const invoiceUuid = "9d4d98aa-f971-4d85-9f21-2b4b2fb99360";
const orderId = "62f88b36-a9d5-4fa6-aa26-e040c3dbf26d";

afterEach(() => vi.unstubAllEnvs());

function sign(data: Record<string, unknown>) {
  const json = JSON.stringify(data).replace(/\//gu, "\\/");
  return createHash("md5").update(`${Buffer.from(json, "utf8").toString("base64")}${apiKey}`).digest("hex");
}

describe("Cryptomus integration helpers", () => {
  it("requires a merchant, payment key and secure application URL", () => {
    // Keep local .env / .dev.vars credentials out of the missing-config case.
    vi.stubEnv("CRYPTOMUS_MERCHANT_ID", "");
    vi.stubEnv("CRYPTOMUS_PAYMENT_API_KEY", "");
    vi.stubEnv("APP_URL", "");

    expect(getCryptomusConfig({ cf: { env: {
      CRYPTOMUS_MERCHANT_ID: merchantId,
      CRYPTOMUS_PAYMENT_API_KEY: apiKey,
      APP_URL: "https://edicut.com/",
    } } })).toEqual({ merchantId, paymentApiKey: apiKey, appUrl: "https://edicut.com" });
    expect(getCryptomusConfig({ cf: { env: { CRYPTOMUS_MERCHANT_ID: merchantId } } })).toBeNull();
    expect(() => getCryptomusConfig({ cf: { env: {
      CRYPTOMUS_MERCHANT_ID: merchantId,
      CRYPTOMUS_PAYMENT_API_KEY: apiKey,
      APP_URL: "http://edicut.com",
    } } })).toThrow(/HTTPS/u);
  });

  it("signs the exact invoice body and accepts only Cryptomus hosted payment links", async () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => Response.json({
      state: 0,
      result: { uuid: invoiceUuid, url: `https://pay.cryptomus.com/pay/${invoiceUuid}`, expired_at: expiresAt },
    }));
    const invoice = await createCryptomusInvoice({
      config: { merchantId, paymentApiKey: apiKey, appUrl: "https://edicut.com" },
      orderId, amountCents: 314900, packageSlug: "creator-pro", fetcher,
    });
    expect(invoice).toEqual({ uuid: invoiceUuid, url: `https://pay.cryptomus.com/pay/${invoiceUuid}`, expiresAt: new Date(expiresAt * 1000) });
    const init = fetcher.mock.calls[0][1]!;
    const body = String(init.body);
    expect(new Headers(init.headers).get("merchant")).toBe(merchantId);
    expect(new Headers(init.headers).get("sign")).toBe(createHash("md5").update(`${Buffer.from(body).toString("base64")}${apiKey}`).digest("hex"));
    expect(JSON.parse(body)).toMatchObject({
      amount: "3149.00", currency: "USD", order_id: orderId,
      url_callback: "https://edicut.com/api/cryptomus/webhook",
      url_return: `https://edicut.com/checkout/creator-pro?step=payment&subscription=${orderId}`,
      accuracy_payment_percent: 0, is_payment_multiple: false, lifetime: 3600,
    });
    expect(isCryptomusPaymentUrl(invoice.url)).toBe(true);
    expect(isCryptomusPaymentUrl("https://pay.cryptomus.com.attacker.example/pay/1")).toBe(false);
    expect(isCryptomusPaymentUrl("http://pay.cryptomus.com/pay/1")).toBe(false);
    expect(isActiveCryptomusInvoice(invoice.url, invoice.expiresAt)).toBe(true);
    expect(isActiveCryptomusInvoice(invoice.url, new Date(Date.now() - 1000))).toBe(false);
  });

  it("keeps test webhook sending disabled unless development or staging is explicitly configured", () => {
    const staging = { env: {
      APP_ENV: "staging",
      APP_URL: "https://staging.edicut.test",
      CRYPTOMUS_TEST_WEBHOOK_ENABLED: "true",
      CRYPTOMUS_TEST_WEBHOOK_CALLBACK_URL: "https://staging.edicut.test/api/cryptomus/test-webhook",
    } };
    expect(getCryptomusTestWebhookCallbackUrl({ env: staging.env })).toBe(staging.env.CRYPTOMUS_TEST_WEBHOOK_CALLBACK_URL);
    expect(isCryptomusTestWebhookEnabled({ env: { ...staging.env, APP_ENV: "production" } })).toBe(false);
    expect(isCryptomusTestWebhookEnabled({ env: { ...staging.env, APP_URL: "https://edicut.com" } })).toBe(false);
    expect(isCryptomusTestWebhookEnabled({ env: { ...staging.env, CRYPTOMUS_TEST_WEBHOOK_ENABLED: "false" } })).toBe(false);
    expect(isCryptomusTestWebhookEnabled({ env: { ...staging.env, CRYPTOMUS_TEST_WEBHOOK_CALLBACK_URL: "http://staging.edicut.test/api/cryptomus/test-webhook" } })).toBe(false);
  });

  it("sends a signed synthetic test callback without a live order or invoice ID", async () => {
    const context = { env: {
      APP_ENV: "development",
      APP_URL: "http://localhost:3002",
      CRYPTOMUS_MERCHANT_ID: merchantId,
      CRYPTOMUS_PAYMENT_API_KEY: apiKey,
      CRYPTOMUS_TEST_WEBHOOK_ENABLED: "true",
      CRYPTOMUS_TEST_WEBHOOK_CALLBACK_URL: "https://staging.edicut.test/api/cryptomus/test-webhook",
    } };
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json({ state: 0, result: [] }));
    await sendCryptomusTestWebhook({ context, currency: "ETH", network: "eth", status: "paid", fetcher });

    const [url, init] = fetcher.mock.calls[0];
    const body = String(init?.body);
    expect(String(url)).toBe("https://api.cryptomus.com/v1/test-webhook/payment");
    expect(new Headers(init?.headers).get("merchant")).toBe(merchantId);
    expect(new Headers(init?.headers).get("sign")).toBe(sign(JSON.parse(body)));
    expect(JSON.parse(body)).toEqual({
      url_callback: "https://staging.edicut.test/api/cryptomus/test-webhook",
      currency: "ETH", network: "eth", status: "paid",
    });
    expect(body).not.toContain("order_id");
    expect(body).not.toContain("uuid");
  });

  it("does not send a test webhook when Cryptomus rejects the request", async () => {
    const context = { env: {
      APP_ENV: "staging", APP_URL: "https://staging.edicut.test",
      CRYPTOMUS_MERCHANT_ID: merchantId, CRYPTOMUS_PAYMENT_API_KEY: apiKey,
      CRYPTOMUS_TEST_WEBHOOK_ENABLED: "true",
      CRYPTOMUS_TEST_WEBHOOK_CALLBACK_URL: "https://staging.edicut.test/api/cryptomus/test-webhook",
    } };
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => Response.json({ state: 1, message: "invalid credentials" }));
    await expect(sendCryptomusTestWebhook({ context, currency: "ETH", network: "eth", status: "paid", fetcher }))
      .rejects.toThrow(/did not accept/u);
  });

  it("validates signatures, exact paid status, order UUID and fiat amount", () => {
    const data = {
      type: "payment", uuid: invoiceUuid, order_id: orderId,
      status: "paid", payment_amount_usd: "3149.00000000",
    };
    const payload = JSON.stringify({ ...data, sign: sign(data) });
    const verified = verifyCryptomusWebhook(payload, apiKey);
    expect(verified).toEqual(data);
    expect(parseCryptomusPaidWebhook(verified!)).toEqual({ orderId, invoiceUuid, amountCents: 314900 });
    expect(verifyCryptomusWebhook(payload, "wrong-key")).toBeNull();
    expect(parseCryptomusPaidWebhook({ ...data, status: "paid_over" })).toBeNull();
    expect(parseCryptomusPaidWebhook({ ...data, payment_amount_usd: "3148.99" })).toEqual({
      orderId, invoiceUuid, amountCents: 314899,
    });
    expect(parseCryptomusPaidWebhook({ ...data, payment_amount_usd: "3148.99999999" })).toBeNull();
    expect(parseCryptomusPaidWebhook({ ...data, payment_amount_usd: "3149.00000001" })).toBeNull();
    expect(parseCryptomusPaidWebhook({ ...data, payment_amount_usd: "3149.00000000" })).toEqual({
      orderId, invoiceUuid, amountCents: 314900,
    });
    expect(parseCryptomusPaidWebhook({ ...data, order_id: "not-a-uuid" })).toBeNull();
  });

  it("rejects malformed webhook JSON and over-sized bodies", () => {
    expect(verifyCryptomusWebhook("not json", apiKey)).toBeNull();
    expect(verifyCryptomusWebhook(" ".repeat(32 * 1024 + 1), apiKey)).toBeNull();
  });
});
