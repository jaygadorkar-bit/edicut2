import { describe, expect, it } from "vitest";
import { validateQuoteDraft } from "./custom-quote-validation";

const valid = {
  requestToken: "22222222-2222-4222-8222-222222222222", title: "Our documentary", phone: "", preferredContact: "email",
  projectType: "documentary", requestType: "single", platforms: ["youtube"], videoCount: "1", duration: "15to30",
  footage: "1to3h", cadence: "once", aspectRatios: ["landscape"], style: "documentary", services: ["cuts"],
  revisions: "recommend", urgency: "flexible", budget: "discuss", deadline: "", languages: "", channelUrl: "",
  footageUrl: "", referenceUrls: "", brief: "Please edit our documentary for a YouTube audience.",
};
const today = "2026-10-04";

describe("quote draft validation before CAPTCHA", () => {
  it("accepts form strings, optional fields, and today's delivery date", () => {
    expect(validateQuoteDraft(valid, today)).toBeUndefined();
    expect(validateQuoteDraft({ ...valid, deadline: today }, today)).toBeUndefined();
  });
  it.each(["services", "platforms", "aspectRatios"])("requires a selection in %s", field => {
    expect(validateQuoteDraft({ ...valid, [field]: [] }, today)?.fieldErrors[field]).toBe("Choose at least one option.");
  });
  it("rejects past delivery dates", () => {
    expect(validateQuoteDraft({ ...valid, deadline: "2026-10-03" }, today)?.fieldErrors.deadline).toBeDefined();
  });
  it("rejects unsafe links and whitespace-only required text", () => {
    const result = validateQuoteDraft({ ...valid, channelUrl: "https://user:password@example.com", referenceUrls: "javascript:alert(1)", brief: " ".repeat(25) }, today);
    expect(result?.fieldErrors).toHaveProperty("channelUrl");
    expect(result?.fieldErrors).toHaveProperty("referenceUrls");
    expect(result?.fieldErrors).toHaveProperty("brief");
  });
  it("requires a usable WhatsApp number only when WhatsApp is chosen", () => {
    expect(validateQuoteDraft({ ...valid, preferredContact: "whatsapp" }, today)?.fieldErrors.phone).toBeDefined();
    expect(validateQuoteDraft({ ...valid, preferredContact: "whatsapp", phone: "01625957738" }, today)).toBeUndefined();
  });
});
