import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatTelegramContactInquiryNotice,
  formatTelegramOrderNotice,
  queueTelegramContactInquiryNotice,
  queueTelegramOrderNotice,
  sendTelegramContactInquiryNotice,
  sendTelegramOrderNotice,
} from "./telegram-notifications.server";

afterEach(() => vi.unstubAllGlobals());

const order = {
  orderId: "order-123",
  kind: "subscription" as const,
  summary: "Studio <Pro>",
  amountCents: 154900,
  currency: "USD",
};

const inquiry = { messageId: "contact-42" };

describe("Telegram order notifications", () => {
  it("formats an unpaid order summary without customer contact details", () => {
    const message = formatTelegramOrderNotice(order);
    expect(message).toContain("New EdiCut monthly package order request");
    expect(message).toContain("<code>order-123</code>");
    expect(message).toContain("Studio &lt;Pro&gt;");
    expect(message).toContain("USD 1,549.00");
    expect(message).toContain("Status: Awaiting payment");
    expect(message).not.toMatch(/phone|email/i);
  });

  it("labels project requests as quotes rather than paid orders", () => {
    const message = formatTelegramOrderNotice({ ...order, kind: "project", summary: "Launch edit" });
    expect(message).toContain("New EdiCut project request");
    expect(message).toContain("Estimate: <b>USD 1,549.00</b>");
    expect(message).toContain("Status: Quote requested");
  });

  it("labels a one-time video purchase separately from a monthly package", () => {
    const message = formatTelegramOrderNotice({ ...order, kind: "single", summary: "Single video edit: Creator Video" });
    expect(message).toContain("New EdiCut single-video order request");
    expect(message).toContain("Amount due: <b>USD 1,549.00</b>");
    expect(message).toContain("Status: Awaiting payment");
  });

  it("sends the message through the Telegram Bot API", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);

    expect(await sendTelegramOrderNotice({
      TELEGRAM_BOT_TOKEN: "12345:secret_token",
      TELEGRAM_CHAT_ID: "-1001234567890",
    }, order)).toBe(true);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot12345:secret_token/sendMessage");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      chat_id: "-1001234567890",
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  });

  it("does not make a request until valid credentials and a chat are configured", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    expect(await sendTelegramOrderNotice({}, order)).toBe(false);
    expect(await sendTelegramOrderNotice({ TELEGRAM_BOT_TOKEN: "invalid", TELEGRAM_CHAT_ID: "123" }, order)).toBe(false);
    expect(await sendTelegramOrderNotice({ TELEGRAM_BOT_TOKEN: "12345:secret_token", TELEGRAM_CHAT_ID: "bad chat id" }, order)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("queues delivery in the Worker background context", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const pending: Promise<unknown>[] = [];

    queueTelegramOrderNotice({
      cf: {
        env: { TELEGRAM_BOT_TOKEN: "12345:secret_token", TELEGRAM_CHAT_ID: "123" },
        ctx: { waitUntil: promise => pending.push(promise) },
      },
    }, order);

    expect(pending).toHaveLength(1);
    await pending[0];
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not throw when Telegram rejects or cannot receive the notification", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false }), { status: 200 })));

    expect(await sendTelegramOrderNotice({ TELEGRAM_BOT_TOKEN: "12345:secret_token", TELEGRAM_CHAT_ID: "123" }, order)).toBe(false);
    expect(log).toHaveBeenCalledWith("Telegram order notification failed", { httpStatus: 200 });
  });
});

describe("Telegram contact inquiry notifications", () => {
  it("links the admin inbox without including the visitor's details", () => {
    const message = formatTelegramContactInquiryNotice(inquiry, "https://edicut.com");

    expect(message).toContain("New EdiCut contact inquiry");
    expect(message).toContain("<code>contact-42</code>");
    expect(message).toContain('href="https://edicut.com/dashboard/messages"');
    expect(message).not.toMatch(/alex|example\.com|phone|email|brief/i);
  });

  it("sends the contact alert through the configured Telegram bot", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetch);

    expect(await sendTelegramContactInquiryNotice({
      APP_URL: "https://edicut.com",
      TELEGRAM_BOT_TOKEN: "12345:secret_token",
      TELEGRAM_CHAT_ID: "-1001234567890",
    }, inquiry)).toBe(true);

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot12345:secret_token/sendMessage");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ chat_id: "-1001234567890", parse_mode: "HTML", disable_web_page_preview: true });
    expect(body.text).toContain("/dashboard/messages");
    expect(body.text).not.toContain("example.com");
  });

  it("queues the alert in the Worker background context", async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const pending: Promise<unknown>[] = [];

    queueTelegramContactInquiryNotice({
      cf: {
        env: {
          APP_URL: "https://edicut.com",
          TELEGRAM_BOT_TOKEN: "12345:secret_token",
          TELEGRAM_CHAT_ID: "123",
        },
        ctx: { waitUntil: promise => pending.push(promise) },
      },
    }, inquiry);

    expect(pending).toHaveLength(1);
    await pending[0];
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("keeps Telegram disabled until both credentials are valid", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    expect(await sendTelegramContactInquiryNotice({}, inquiry)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
