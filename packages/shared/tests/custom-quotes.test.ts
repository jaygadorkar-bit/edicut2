import { describe, expect, it } from "vitest";
import { customQuoteInputSchema, customQuoteOptionsSchema } from "../src/contracts/custom-quotes.js";

const validQuote = {
  requestToken: "11111111-1111-4111-8111-111111111111", title: "A new series", phone: "", preferredContact: "email",
  projectType: "youtube", requestType: "single", platforms: ["youtube"], videoCount: "2", duration: "5to15", footage: "unsure",
  cadence: "once", aspectRatios: ["landscape"], style: "recommend", services: ["cuts", "audio"], revisions: "recommend",
  urgency: "flexible", budget: "discuss", deadline: "", languages: "", channelUrl: "", footageUrl: "", referenceUrls: "",
  brief: "Edit our educational series with clear pacing and clean audio.",
};
describe("custom quote validation", () => {
  it("normalizes video count and strips untrusted account, status, and pricing fields", () => {
    const result = customQuoteInputSchema.parse({ ...validQuote, email: "fake@example.com", ownerId: "fake", status: "closed", amount: 1 });
    expect(result.videoCount).toBe(2);
    expect(result).not.toHaveProperty("email"); expect(result).not.toHaveProperty("status");
    expect(customQuoteOptionsSchema.parse(result)).not.toHaveProperty("requestToken");
  });
  it.each([{ services: [] }, { services: ["free"] }, { platforms: ["youtube", "youtube"] }, { videoCount: 1.5 }, { videoCount: 0 }, { videoCount: 1001 }, { deadline: "2026-02-30" }, { brief: "too short" }, { requestToken: "bad" }])("rejects unsupported or incomplete choices %j", fields => {
    expect(customQuoteInputSchema.safeParse({ ...validQuote, ...fields }).success).toBe(false);
  });
  it.each(["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com", "file:///a"])("rejects unsafe shared link %s", channelUrl => {
    expect(customQuoteInputSchema.safeParse({ ...validQuote, channelUrl }).success).toBe(false);
  });
  it("requires a valid phone number only when WhatsApp is preferred", () => {
    expect(customQuoteInputSchema.safeParse({ ...validQuote, preferredContact: "whatsapp" }).success).toBe(false);
    expect(customQuoteInputSchema.safeParse({ ...validQuote, preferredContact: "whatsapp", phone: "01625957738" }).success).toBe(true);
    expect(customQuoteInputSchema.safeParse({ ...validQuote, phone: "call me" }).success).toBe(false);
  });
  it("limits references and validates every line", () => {
    expect(customQuoteInputSchema.safeParse({ ...validQuote, referenceUrls: Array(6).fill("https://example.com").join("\n") }).success).toBe(false);
    expect(customQuoteInputSchema.safeParse({ ...validQuote, referenceUrls: "https://example.com\njavascript:alert(1)" }).success).toBe(false);
  });
});
