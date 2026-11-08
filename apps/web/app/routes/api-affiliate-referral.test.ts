import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consumeUsageLimit: vi.fn(async (_input: Record<string, unknown>) => "allowed" as string),
  hashUsageLimitKey: vi.fn(async (_value: string) => "hashed-address"),
  getDbFromContext: vi.fn(() => ({ db: true })),
  getSession: vi.fn(async () => ({ get: (key: string) => key === "userId" ? "partner-user" : undefined })),
  loadAffiliateProgram: vi.fn(async () => ({ settings: { attributionDays: 30 } })),
  recordAffiliateVisit: vi.fn(async () => "11111111-1111-4111-8111-111111111111" as string | null),
  isMissingAffiliateSchema: vi.fn(() => false),
  normalizeMarketingCode: vi.fn((value: string) => /^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(value) ? value : null),
}));

vi.mock("../lib/db.server", () => ({ getDbFromContext: mocks.getDbFromContext }));
vi.mock("../lib/session.server", () => ({ getSession: mocks.getSession }));
vi.mock("../lib/usage-protection.server", () => ({ consumeUsageLimit: mocks.consumeUsageLimit, hashUsageLimitKey: mocks.hashUsageLimitKey }));
vi.mock("../lib/marketing.server", () => ({ normalizeMarketingCode: mocks.normalizeMarketingCode }));
vi.mock("../lib/affiliate-program.server", () => ({
  loadAffiliateProgram: mocks.loadAffiliateProgram,
  recordAffiliateVisit: mocks.recordAffiliateVisit,
  isMissingAffiliateSchema: mocks.isMissingAffiliateSchema,
}));

import { action, loader } from "./api-affiliate-referral";

const body = (fields: Record<string, string>) => new URLSearchParams(fields);
function args(fields?: Record<string, string>, options: { origin?: string; contentType?: string; cookie?: string; fetchSite?: string; ip?: string } = {}) {
  const headers = new Headers();
  if (options.contentType) headers.set("Content-Type", options.contentType);
  if (options.origin !== undefined) headers.set("Origin", options.origin);
  if (options.cookie) headers.set("Cookie", options.cookie);
  if (options.fetchSite) headers.set("Sec-Fetch-Site", options.fetchSite);
  if (options.ip) headers.set("CF-Connecting-IP", options.ip);
  const request = new Request("https://edicut.com/api/affiliate/referral", fields ? { method: "POST", headers, body: body(fields) } : { method: "GET", headers });
  return { request, params: {}, context: {} } as Parameters<typeof action>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.consumeUsageLimit.mockResolvedValue("allowed");
  mocks.hashUsageLimitKey.mockImplementation(async () => "hashed-address");
  mocks.recordAffiliateVisit.mockResolvedValue("11111111-1111-4111-8111-111111111111");
  mocks.loadAffiliateProgram.mockResolvedValue({ settings: { attributionDays: 30 } });
});

describe("affiliate referral endpoint", () => {
  it("allows only POST and marks the endpoint private", async () => {
    const response = loader();
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("same-origin");
  });

  it("rejects cross-origin and cross-site mutations before data access", async () => {
    const crossOrigin = await action(args({ ref: "CREATOR-1", landingPath: "/pricing" }, { origin: "https://evil.test" }));
    const crossSite = await action(args({ ref: "CREATOR-1", landingPath: "/pricing" }, { fetchSite: "cross-site" }));
    expect(crossOrigin.status).toBe(403);
    expect(crossSite.status).toBe(403);
    expect(mocks.getDbFromContext).not.toHaveBeenCalled();
    expect(mocks.consumeUsageLimit).not.toHaveBeenCalled();
  });

  it("requires a bounded form body and rejects invalid or oversized submissions", async () => {
    const wrongType = await action(args({ ref: "CREATOR-1" }, { contentType: "application/json" }));
    expect(wrongType.status).toBe(400);

    const oversized = await action(args({ ref: "CREATOR-1", landingPath: "/pricing", extra: "x".repeat(2500) }));
    expect(oversized.status).toBe(400);
    expect(mocks.consumeUsageLimit).not.toHaveBeenCalled();
  });

  it("clears the referral cookie when consent is absent", async () => {
    const response = await action(args({ ref: "CREATOR-1", landingPath: "/pricing" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toContain("edicut_referral=");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.consumeUsageLimit).not.toHaveBeenCalled();
    expect(mocks.recordAffiliateVisit).not.toHaveBeenCalled();
  });

  it("limits tracking attempts before database work", async () => {
    mocks.consumeUsageLimit.mockResolvedValue("limited");
    const response = await action(args({ ref: "CREATOR-1", landingPath: "/pricing" }, { cookie: "edicut_marketing_consent=yes", ip: "203.0.113.42" }));
    expect(response.status).toBe(429);
    expect(mocks.hashUsageLimitKey).toHaveBeenCalledWith("203.0.113.42");
    expect(mocks.consumeUsageLimit).toHaveBeenCalledWith(expect.objectContaining({ key: "affiliate-visit:hashed-address", localLimit: 20, localPeriodSeconds: 60 }));
    expect(String(mocks.consumeUsageLimit.mock.calls[0]?.[0].key)).not.toContain("203.0.113.42");
    expect(mocks.getDbFromContext).not.toHaveBeenCalled();
  });

  it("rejects non-allowlisted landing paths before rate limiting", async () => {
    const response = await action(args({ ref: "CREATOR-1", landingPath: "/dashboard?x=1" }, { cookie: "edicut_marketing_consent=yes" }));
    expect(response.status).toBe(400);
    expect(mocks.consumeUsageLimit).not.toHaveBeenCalled();
  });

  it("does not set attribution when the visit helper rejects self-referrals", async () => {
    mocks.recordAffiliateVisit.mockResolvedValue(null);
    const response = await action(args({ ref: "CREATOR-1", landingPath: "/pricing", campaign: "spring launch" }, { cookie: "edicut_marketing_consent=yes" }));
    expect(response.status).toBe(204);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(mocks.recordAffiliateVisit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: "CREATOR-1", landingPath: "/pricing", userId: "partner-user" }));
  });

  it("records consented visits and sets a signed HttpOnly attribution cookie", async () => {
    const response = await action(args({ ref: "CREATOR-1", landingPath: "/pricing", campaign: "Spring launch" }, { origin: "https://edicut.com", cookie: "edicut_marketing_consent=yes" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Set-Cookie")).toContain("edicut_referral=");
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(response.headers.get("Set-Cookie")).toContain("SameSite=Lax");
    expect(mocks.recordAffiliateVisit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: "CREATOR-1", campaign: "spring-launch", landingPath: "/pricing", userId: "partner-user" }));
  });

  it("deduplicates an existing referral cookie without extending its expiration", async () => {
    const { serializeAffiliateReferral } = await import("../lib/affiliate-referral.server");
    const issuedAt = Date.now() - 10 * 86_400_000;
    const expiresAt = issuedAt + 30 * 86_400_000;
    const cookie = await serializeAffiliateReferral(new Request("https://edicut.com/api/affiliate/referral"), { cf: { env: { NODE_ENV: "development" } } }, {
      code: "CREATOR-1", visitId: "11111111-1111-4111-8111-111111111111", campaign: "spring-launch", landingPath: "/pricing", issuedAt, expiresAt,
    });
    const response = await action(args({ ref: "CREATOR-1", landingPath: "/pricing", campaign: "Spring launch" }, { cookie: `edicut_marketing_consent=yes; ${cookie.split(";")[0]}` }));
    expect(response.status).toBe(204);
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(mocks.recordAffiliateVisit).not.toHaveBeenCalled();
    expect(mocks.getSession).not.toHaveBeenCalled();
  });

  it("returns unavailable without issuing attribution when the backend fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.loadAffiliateProgram.mockRejectedValue(new Error("database unavailable"));
    const response = await action(args({ ref: "CREATOR-1", landingPath: "/pricing" }, { cookie: "edicut_marketing_consent=yes" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(mocks.recordAffiliateVisit).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
