import { fetchWithTimeout } from "@edicut/shared/server-fetch";

const TELEGRAM_API_TIMEOUT_MS = 5_000;

export type TelegramOrderNotice = {
  orderId: string;
  kind: "subscription" | "single" | "project";
  summary: string;
  amountCents: number;
  currency: string;
};

export type TelegramContactInquiryNotice = {
  messageId: string;
};

type RuntimeContext = {
  cf?: {
    env?: Record<string, string | undefined>;
    ctx?: { waitUntil?: (promise: Promise<unknown>) => void };
  };
  cloudflare?: {
    env?: Record<string, string | undefined>;
    ctx?: { waitUntil?: (promise: Promise<unknown>) => void };
  };
};

function runtimeEnvironment(context?: RuntimeContext) {
  const processEnv = (globalThis.process as { env?: Record<string, string | undefined> } | undefined)?.env;
  return {
    ...processEnv,
    ...context?.cf?.env,
    ...context?.cloudflare?.env,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function formatAmount(amountCents: number, currency: string) {
  const currencyCode = /^[A-Z]{3}$/i.test(currency) ? currency.toUpperCase() : "USD";
  const amount = (amountCents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currencyCode} ${amount}`;
}

export function formatTelegramOrderNotice(order: TelegramOrderNotice) {
  if (!order.orderId || !order.summary || !Number.isSafeInteger(order.amountCents) || order.amountCents < 0) {
    return null;
  }

  const kindLabel = order.kind === "project" ? "project request" : order.kind === "single" ? "single-video order request" : "monthly package order request";
  const amountLabel = order.kind === "project" ? "Estimate" : "Amount due";
  const status = order.kind === "project" ? "Quote requested" : "Awaiting payment";
  return [
    `🛍️ <b>New EdiCut ${kindLabel}</b>`,
    `Order: <code>${escapeHtml(order.orderId)}</code>`,
    `Details: ${escapeHtml(order.summary)}`,
    `${amountLabel}: <b>${escapeHtml(formatAmount(order.amountCents, order.currency))}</b>`,
    `Status: ${status}`,
  ].join("\n");
}

export function formatTelegramContactInquiryNotice(
  inquiry: TelegramContactInquiryNotice,
  appUrl = "https://edicut.com",
) {
  const messageId = inquiry.messageId.trim();
  if (!messageId || messageId.length > 64) return null;

  let inboxUrl: URL;
  try {
    const baseUrl = new URL(appUrl);
    if (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") return null;
    inboxUrl = new URL("/dashboard/messages", baseUrl);
  } catch {
    return null;
  }

  return [
    "📬 <b>New EdiCut contact inquiry</b>",
    `Reference: <code>${escapeHtml(messageId)}</code>`,
    `<a href="${escapeHtml(inboxUrl.toString())}">Open the admin inbox</a>`,
  ].join("\n");
}

async function sendTelegramText(env: Record<string, string | undefined>, text: string | null, failureLabel: string) {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = env.TELEGRAM_CHAT_ID?.trim();
  const validChatId = chatId && (/^-?\d+$/.test(chatId) || /^@[A-Za-z0-9_]{5,32}$/.test(chatId));
  if (!token || !/^[0-9]+:[A-Za-z0-9_-]+$/.test(token) || !validChatId || !text) {
    return false;
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
      TELEGRAM_API_TIMEOUT_MS,
    );
    const result = await response.json() as { ok?: unknown };
    if (!response.ok || result?.ok !== true) {
      console.error(`${failureLabel} failed`, { httpStatus: response.status });
      return false;
    }
    return true;
  } catch {
    // Do not log the request URL: it contains the bot token.
    console.error(`${failureLabel} failed`);
    return false;
  }
}

export function sendTelegramOrderNotice(
  env: Record<string, string | undefined>,
  order: TelegramOrderNotice,
) {
  return sendTelegramText(env, formatTelegramOrderNotice(order), "Telegram order notification");
}

export function sendTelegramContactInquiryNotice(
  env: Record<string, string | undefined>,
  inquiry: TelegramContactInquiryNotice,
) {
  return sendTelegramText(
    env,
    formatTelegramContactInquiryNotice(inquiry, env.APP_URL?.trim() || "https://edicut.com"),
    "Telegram contact inquiry notification",
  );
}

export function queueTelegramOrderNotice(context: RuntimeContext, order: TelegramOrderNotice) {
  const env = runtimeEnvironment(context);
  const delivery = sendTelegramOrderNotice(env, order);
  const executionContext = context.cloudflare?.ctx ?? context.cf?.ctx;
  if (executionContext?.waitUntil) {
    executionContext.waitUntil(delivery);
  } else {
    void delivery;
  }
}

export function queueTelegramContactInquiryNotice(context: RuntimeContext, inquiry: TelegramContactInquiryNotice) {
  const env = runtimeEnvironment(context);
  const delivery = sendTelegramContactInquiryNotice(env, inquiry);
  const executionContext = context.cloudflare?.ctx ?? context.cf?.ctx;
  if (executionContext?.waitUntil) {
    executionContext.waitUntil(delivery);
  } else {
    void delivery;
  }
}
