import { Buffer } from "node:buffer";
import { createHash, timingSafeEqual } from "node:crypto";
import { isCryptomusPaymentUrl } from "./cryptomus";

export { isCryptomusPaymentUrl } from "./cryptomus";

type RuntimeEnv = Record<string, string | undefined>;
type RuntimeContext = {
  cf?: { env?: RuntimeEnv };
  cloudflare?: { env?: RuntimeEnv };
  env?: RuntimeEnv;
};

const CRYPTOMUS_TEST_WEBHOOK_STATUSES = [
  "process", "check", "paid", "paid_over", "fail", "wrong_amount", "cancel",
  "system_fail", "refund_process", "refund_fail", "refund_paid", "locked",
] as const;

export type CryptomusTestWebhookStatus = typeof CRYPTOMUS_TEST_WEBHOOK_STATUSES[number];

export type CryptomusConfig = {
  merchantId: string;
  paymentApiKey: string;
  appUrl: string;
};

export type CryptomusInvoice = { uuid: string; url: string; expiresAt: Date };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_WEBHOOK_BYTES = 32 * 1024;

function readEnv(context: RuntimeContext | undefined, key: string) {
  const nodeEnv = globalThis.process?.env as RuntimeEnv | undefined;
  return context?.cloudflare?.env?.[key]
    ?? context?.cf?.env?.[key]
    ?? context?.env?.[key]
    ?? nodeEnv?.[key]
    ?? "";
}

export function getCryptomusConfig(context?: RuntimeContext): CryptomusConfig | null {
  const merchantId = readEnv(context, "CRYPTOMUS_MERCHANT_ID").trim();
  const paymentApiKey = readEnv(context, "CRYPTOMUS_PAYMENT_API_KEY").trim();
  const appUrl = readEnv(context, "APP_URL").trim().replace(/\/$/u, "");
  if (!merchantId || !paymentApiKey || !appUrl) return null;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(appUrl);
  } catch {
    throw new Error("Cryptomus requires a valid APP_URL.");
  }
  if (parsedUrl.username || parsedUrl.password || (parsedUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsedUrl.hostname))) {
    throw new Error("Cryptomus requires HTTPS for APP_URL outside local development.");
  }
  if (!UUID_PATTERN.test(merchantId)) throw new Error("Cryptomus merchant ID is not a valid UUID.");
  return { merchantId, paymentApiKey, appUrl: parsedUrl.origin };
}

function isProductionHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, "");
  return normalized === "edicut.com" || normalized === "www.edicut.com";
}

/** Test webhooks are enabled only on explicitly enabled development/staging deployments. */
export function getCryptomusTestWebhookCallbackUrl(context?: RuntimeContext) {
  if (readEnv(context, "CRYPTOMUS_TEST_WEBHOOK_ENABLED").trim().toLowerCase() !== "true") return null;
  const appEnvironment = readEnv(context, "APP_ENV").trim().toLowerCase();
  if (appEnvironment !== "development" && appEnvironment !== "staging") return null;

  let appUrl: URL;
  let callbackUrl: URL;
  try {
    appUrl = new URL(readEnv(context, "APP_URL").trim());
    callbackUrl = new URL(readEnv(context, "CRYPTOMUS_TEST_WEBHOOK_CALLBACK_URL").trim());
  } catch {
    return null;
  }
  if (isProductionHostname(appUrl.hostname) || isProductionHostname(callbackUrl.hostname)) return null;
  if (callbackUrl.protocol !== "https:" || callbackUrl.username || callbackUrl.password
    || callbackUrl.search || callbackUrl.hash || callbackUrl.pathname !== "/api/cryptomus/test-webhook") return null;
  return callbackUrl.toString();
}

export function isCryptomusTestWebhookEnabled(context?: RuntimeContext) {
  return getCryptomusTestWebhookCallbackUrl(context) !== null;
}

function cryptomusSign(jsonBody: string, apiKey: string) {
  const base64Body = Buffer.from(jsonBody, "utf8").toString("base64");
  return createHash("md5").update(`${base64Body}${apiKey}`, "utf8").digest("hex");
}

function cryptomusJson(value: Record<string, unknown>) {
  // Cryptomus' PHP examples escape forward slashes before calculating the sign.
  return JSON.stringify(value).replace(/\//gu, "\\/");
}

export async function createCryptomusInvoice(input: {
  config: CryptomusConfig;
  orderId: string;
  amountCents: number;
  packageSlug: string;
  refresh?: boolean;
  fetcher?: typeof fetch;
}): Promise<CryptomusInvoice> {
  const { config, orderId, amountCents, packageSlug, refresh = false } = input;
  if (!UUID_PATTERN.test(orderId) || !Number.isSafeInteger(amountCents) || amountCents < 1) {
    throw new Error("Cryptomus invoice details are invalid.");
  }
  const returnUrl = new URL(`/checkout/${encodeURIComponent(packageSlug)}?step=payment&subscription=${encodeURIComponent(orderId)}`, config.appUrl).toString();
  const successUrl = new URL("/dashboard/subscriptions?payment=success", config.appUrl).toString();
  const body = {
    amount: (amountCents / 100).toFixed(2),
    currency: "USD",
    order_id: orderId,
    url_return: returnUrl,
    url_success: successUrl,
    url_callback: new URL("/api/cryptomus/webhook", config.appUrl).toString(),
    is_payment_multiple: false,
    lifetime: 3600,
    accuracy_payment_percent: 0,
    ...(refresh ? { is_refresh: true } : {}),
  };
  const serialized = cryptomusJson(body);
  const response = await (input.fetcher ?? fetch)("https://api.cryptomus.com/v1/payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      merchant: config.merchantId,
      sign: cryptomusSign(serialized, config.paymentApiKey),
    },
    body: serialized,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Cryptomus invoice request failed.");

  let result: unknown;
  try {
    const text = await response.text();
    if (text.length > MAX_WEBHOOK_BYTES) throw new Error("Cryptomus response is too large.");
    result = JSON.parse(text);
  } catch {
    throw new Error("Cryptomus returned an invalid invoice response.");
  }
  if (!result || typeof result !== "object") throw new Error("Cryptomus returned an invalid invoice response.");
  const responseBody = result as { state?: unknown; result?: unknown };
  const invoice = responseBody.result as { uuid?: unknown; url?: unknown; expired_at?: unknown } | undefined;
  if (responseBody.state !== 0 || !invoice || typeof invoice.uuid !== "string"
    || !UUID_PATTERN.test(invoice.uuid) || !isCryptomusPaymentUrl(invoice.url)
    || typeof invoice.expired_at !== "number" || !Number.isSafeInteger(invoice.expired_at) || invoice.expired_at <= 0) {
    throw new Error("Cryptomus did not return a valid payment link.");
  }
  return { uuid: invoice.uuid, url: invoice.url, expiresAt: new Date(invoice.expired_at * 1000) };
}

export async function sendCryptomusTestWebhook(input: {
  context?: RuntimeContext;
  currency: string;
  network: string;
  status: CryptomusTestWebhookStatus;
  fetcher?: typeof fetch;
}) {
  const config = getCryptomusConfig(input.context);
  const callbackUrl = getCryptomusTestWebhookCallbackUrl(input.context);
  if (!config || !callbackUrl) throw new Error("Cryptomus test webhooks are not enabled for this environment.");
  if (!/^[A-Z0-9]{2,16}$/u.test(input.currency) || !/^[a-z0-9_-]{2,32}$/u.test(input.network)
    || !CRYPTOMUS_TEST_WEBHOOK_STATUSES.includes(input.status)) {
    throw new Error("Cryptomus test webhook details are invalid.");
  }

  // Intentionally omit uuid and order_id: Cryptomus sends a synthetic test invoice,
  // and this callback is received by an isolated route that cannot mark orders paid.
  const body = {
    url_callback: callbackUrl,
    currency: input.currency,
    network: input.network,
    status: input.status,
  };
  const serialized = cryptomusJson(body);
  const response = await (input.fetcher ?? fetch)("https://api.cryptomus.com/v1/test-webhook/payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      merchant: config.merchantId,
      sign: cryptomusSign(serialized, config.paymentApiKey),
    },
    body: serialized,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("Cryptomus test webhook request failed.");

  let result: unknown;
  try {
    const text = await response.text();
    if (text.length > MAX_WEBHOOK_BYTES) throw new Error("Cryptomus response is too large.");
    result = JSON.parse(text);
  } catch {
    throw new Error("Cryptomus returned an invalid test webhook response.");
  }
  if (!result || typeof result !== "object" || (result as { state?: unknown }).state !== 0) {
    throw new Error("Cryptomus did not accept the test webhook request.");
  }
}

export function verifyCryptomusWebhook(rawBody: string, apiKey: string): Record<string, unknown> | null {
  if (!apiKey || Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const fields = body as Record<string, unknown>;
  const suppliedSign = fields.sign;
  if (typeof suppliedSign !== "string" || !/^[a-f0-9]{32}$/iu.test(suppliedSign)) return null;
  const data = Object.fromEntries(Object.entries(fields).filter(([key]) => key !== "sign"));
  const expected = Buffer.from(cryptomusSign(cryptomusJson(data), apiKey), "hex");
  const supplied = Buffer.from(suppliedSign, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return data;
}

export function parseCryptomusPaidWebhook(data: Record<string, unknown>) {
  if (data.type !== "payment" || data.status !== "paid"
    || typeof data.order_id !== "string" || !UUID_PATTERN.test(data.order_id)
    || typeof data.uuid !== "string" || !UUID_PATTERN.test(data.uuid)) return null;
  const cents = parseUsdCents(data.payment_amount_usd);
  return cents === null ? null : { orderId: data.order_id, invoiceUuid: data.uuid, amountCents: cents };
}

function parseUsdCents(value: unknown) {
  if (typeof value !== "string" || value.length > 24 || !/^\d+(?:\.\d{1,8})?$/u.test(value)) return null;
  const [wholePart, fractionPart = ""] = value.split(".");
  const fraction = fractionPart.padEnd(2, "0");
  const whole = Number(wholePart);
  if (!Number.isSafeInteger(whole) || whole > Math.floor(Number.MAX_SAFE_INTEGER / 100)) return null;
  if (/[1-9]/u.test(fractionPart.slice(2))) return null;
  const cents = whole * 100 + Number(fraction);
  return Number.isSafeInteger(cents) ? cents : null;
}

