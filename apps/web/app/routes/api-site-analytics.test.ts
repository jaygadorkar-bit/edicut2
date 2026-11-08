import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), consume: vi.fn(async () => "allowed"), hash: vi.fn(async () => "ip-hash") }));
vi.mock("../lib/db.server", () => ({ getDbFromContext: () => ({ execute: mocks.execute }) }));
vi.mock("../lib/usage-protection.server", async importOriginal => ({
  ...await importOriginal<typeof import("../lib/usage-protection.server")>(),
  consumeUsageLimit: mocks.consume,
  hashUsageLimitKey: mocks.hash,
}));

import { action } from "./api-site-analytics";

function post(body: unknown, overrides: { origin?: string; cookie?: string } = {}) {
  const headers = new Headers({
    "Content-Type": "application/json",
    Origin: overrides.origin ?? "http://localhost:3002",
    Cookie: overrides.cookie ?? "edicut_analytics_consent=yes",
  });
  return new Request("http://localhost:3002/api/site-analytics", { method: "POST", headers, body: JSON.stringify(body) });
}

describe("site analytics collection endpoint", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does not store events without the analytics-consent cookie", async () => {
    const result = await action({ request: post({ events: [] }, { cookie: "" }), context: {} } as never);
    expect(result.status).toBe(204);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("rejects cross-origin collection requests", async () => {
    const result = await action({ request: post({ events: [] }, { origin: "https://attacker.example" }), context: {} } as never);
    expect(result.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rate limits and stores only validated aggregate deltas", async () => {
    mocks.execute.mockResolvedValue([]);
    const result = await action({ request: post({ events: [{
      pagePath: "/pricing/123",
      region: "pricing",
      hoverCount: 1,
      clickCount: 0,
      dwellMs: 750,
    }] }), context: { cf: { env: { APP_MUTATION_LIMITER: {} } } } } as never);

    expect(result.status).toBe(202);
    expect(mocks.hash).toHaveBeenCalledWith("unknown");
    expect(mocks.consume).toHaveBeenCalledWith(expect.objectContaining({ bindingName: "APP_MUTATION_LIMITER", key: "site-analytics:ip-hash" }));
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("stores consented source/conversion totals without requiring interaction events", async () => {
    mocks.execute.mockResolvedValue([]);
    const result = await action({ request: post({ acquisition: [{
      pagePath: "/contact", landingPath: "/services/youtube-video-editing", source: "organic_search", event: "contact_inquiry", count: 1,
    }] }), context: {} } as never);
    expect(result.status).toBe(202);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("accepts a consented server-confirmed quote completion without storing its request ID", async () => {
    mocks.execute.mockResolvedValue([]);
    const result = await action({ request: post({ acquisition: [{
      pagePath: "/custom-quote", landingPath: "/services/youtube-video-editing", source: "organic_search", event: "quote_request", count: 1,
    }] }), context: {} } as never);
    expect(result.status).toBe(202);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("rejects quote IDs and page-view events from the conversion-only route", async () => {
    const withId = await action({ request: post({ acquisition: [{
      pagePath: "/custom-quote", landingPath: "/", source: "direct", event: "quote_request", count: 1, id: "customer-123",
    }] }), context: {} } as never);
    const pageView = await action({ request: post({ acquisition: [{
      pagePath: "/custom-quote", landingPath: "/", source: "direct", event: "page_view", count: 1,
    }] }), context: {} } as never);
    expect(withId.status).toBe(400);
    expect(pageView.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects attempts to add personal referrer data before database access", async () => {
    const result = await action({ request: post({ acquisition: [{
      pagePath: "/contact", landingPath: "/", source: "organic_search", event: "contact_inquiry", count: 1, referrer: "https://google.com/?q=private",
    }] }), context: {} } as never);
    expect(result.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.consume).not.toHaveBeenCalled();
  });
});
