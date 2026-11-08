import type { ActionFunctionArgs } from "react-router";
import {
  getCryptomusConfig,
  getCryptomusTestWebhookCallbackUrl,
  verifyCryptomusWebhook,
} from "../lib/cryptomus.server";

const responseHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const MAX_BODY_BYTES = 32 * 1024;
const TEST_STATUSES = new Set([
  "process", "check", "paid", "paid_over", "fail", "wrong_amount", "cancel",
  "system_fail", "refund_process", "refund_fail", "refund_paid", "locked",
]);

export function loader() {
  return Response.json({ error: "Method not allowed" }, {
    status: 405,
    headers: { ...responseHeaders, Allow: "POST" },
  });
}

async function readBoundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return { ok: true as const, body: "" };
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return { ok: false as const, tooLarge: true };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true as const, body: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    try { await reader.cancel(); } catch { /* The stream may already be closed. */ }
    return { ok: false as const, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

/** Receives Cryptomus test callbacks without changing any order or subscription state. */
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...responseHeaders, Allow: "POST" } });
  }
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY_BYTES) {
    return Response.json({ error: "Request too large" }, { status: 413, headers: responseHeaders });
  }

  const callbackUrl = getCryptomusTestWebhookCallbackUrl(context);
  if (!callbackUrl) return Response.json({ error: "Not found" }, { status: 404, headers: responseHeaders });
  const expectedUrl = new URL(callbackUrl);
  const requestUrl = new URL(request.url);
  // HTTPS tunnels can forward callbacks to a local HTTP origin, so validate the
  // fixed receiver path here and rely on Cryptomus' HMAC signature for authenticity.
  if (requestUrl.pathname !== expectedUrl.pathname || requestUrl.search) {
    return Response.json({ error: "Not found" }, { status: 404, headers: responseHeaders });
  }

  let config: ReturnType<typeof getCryptomusConfig>;
  try {
    config = getCryptomusConfig(context);
  } catch {
    console.error("Cryptomus test webhook receiver configuration is invalid.");
    return Response.json({ error: "Payment gateway is unavailable" }, { status: 503, headers: responseHeaders });
  }
  if (!config) return Response.json({ error: "Payment gateway is unavailable" }, { status: 503, headers: responseHeaders });
  const readResult = await readBoundedBody(request);
  if (!readResult.ok) {
    return Response.json({ error: readResult.tooLarge ? "Request too large" : "Invalid request body" }, {
      status: readResult.tooLarge ? 413 : 400,
      headers: responseHeaders,
    });
  }

  const data = verifyCryptomusWebhook(readResult.body, config.paymentApiKey);
  if (!data) return Response.json({ error: "Invalid signature" }, { status: 401, headers: responseHeaders });
  if (data.type !== "payment" || typeof data.status !== "string" || !TEST_STATUSES.has(data.status)
    || typeof data.currency !== "string" || data.currency.length > 16
    || typeof data.network !== "string" || data.network.length > 32) {
    return Response.json({ error: "Invalid test webhook payload" }, { status: 400, headers: responseHeaders });
  }

  console.info("Cryptomus test webhook received", {
    status: data.status,
    currency: data.currency,
    network: data.network,
  });
  return Response.json({ received: true, test: true, status: data.status }, { headers: responseHeaders });
}
