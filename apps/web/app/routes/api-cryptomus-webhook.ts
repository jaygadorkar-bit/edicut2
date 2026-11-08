import type { ActionFunctionArgs } from "react-router";
import { getDbFromContext } from "../lib/db.server";
import { markSubscriptionPaidByCryptomus } from "../lib/customer-subscriptions.server";
import { getCryptomusConfig, parseCryptomusPaidWebhook, verifyCryptomusWebhook } from "../lib/cryptomus.server";
import { scheduleApplicationErrorCapture } from "../lib/application-error-log.server";

const responseHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const MAX_BODY_BYTES = 32 * 1024;

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
    try {
      await reader.cancel();
    } catch {
      // The stream may already be errored or canceled.
    }
    return { ok: false as const, tooLarge: false };
  } finally {
    reader.releaseLock();
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...responseHeaders, Allow: "POST" } });
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > MAX_BODY_BYTES) return Response.json({ error: "Request too large" }, { status: 413, headers: responseHeaders });

  const readResult = await readBoundedBody(request);
  if (!readResult.ok) {
    const status = readResult.tooLarge ? 413 : 400;
    const error = readResult.tooLarge ? "Request too large" : "Invalid request body";
    return Response.json({ error }, { status, headers: responseHeaders });
  }
  const { body: rawBody } = readResult;

  let config;
  try {
    config = getCryptomusConfig(context);
  } catch {
    return Response.json({ error: "Payment gateway is unavailable" }, { status: 503, headers: responseHeaders });
  }
  if (!config) return Response.json({ error: "Payment gateway is unavailable" }, { status: 503, headers: responseHeaders });

  const data = verifyCryptomusWebhook(rawBody, config.paymentApiKey);
  if (!data) return Response.json({ error: "Invalid signature" }, { status: 401, headers: responseHeaders });
  const payment = parseCryptomusPaidWebhook(data);
  if (!payment) return Response.json({ received: true }, { headers: responseHeaders });

  try {
    await markSubscriptionPaidByCryptomus(getDbFromContext(context), {
      id: payment.orderId,
      invoiceUuid: payment.invoiceUuid,
      amountCents: payment.amountCents,
    });
  } catch (error) {
    scheduleApplicationErrorCapture(context, request, error);
    return Response.json({ error: "Payment callback could not be saved" }, { status: 500, headers: responseHeaders });
  }
  // Unknown, stale and duplicate invoice callbacks are acknowledged but never
  // alter a record unless its ID, invoice, amount and unpaid status all match.
  return Response.json({ received: true }, { headers: responseHeaders });
}
