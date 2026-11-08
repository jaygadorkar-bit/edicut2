import { describe, expect, it } from "vitest";
import {
  calculateAffiliateCommissionCents, DEFAULT_AFFILIATE_PROGRAM_SETTINGS,
  normalizeAffiliateCampaign, normalizeAffiliateSocialMedia, normalizeWhatsAppPhone, parseAffiliateSettings,
} from "./affiliate-program";

describe("affiliate program helpers", () => {
  it("keeps payouts disabled until settings explicitly enable them", () => {
    expect(parseAffiliateSettings(null)).toEqual(DEFAULT_AFFILIATE_PROGRAM_SETTINGS);
    expect(parseAffiliateSettings('{"payoutsEnabled":true}').payoutsEnabled).toBe(true);
    expect(parseAffiliateSettings("null")).toEqual(DEFAULT_AFFILIATE_PROGRAM_SETTINGS);
  });

  it("bounds settings and restores invalid values to safe defaults", () => {
    expect(parseAffiliateSettings('{"attributionDays":365,"holdDays":-1,"minimumPayoutCents":5,"applicationsOpen":false}')).toEqual({
      attributionDays: 30, holdDays: 30, minimumPayoutCents: 5000, payoutsEnabled: false, applicationsOpen: false,
    });
  });

  it("normalizes campaign slugs without accepting empty or unsafe values", () => {
    expect(normalizeAffiliateCampaign("  Spring 2026 / Creators! ")).toBe("spring-2026-creators");
    expect(normalizeAffiliateCampaign("---")).toBeNull();
    expect(normalizeAffiliateCampaign(null)).toBeNull();
  });

  it("normalizes WhatsApp numbers into international format", () => {
    expect(normalizeWhatsAppPhone(" +880 1712-345 678 ")).toBe("+8801712345678");
    expect(normalizeWhatsAppPhone("+1 (202) 555-0123")).toBe("+12025550123");
    expect(normalizeWhatsAppPhone("01712345678")).toBeNull();
    expect(normalizeWhatsAppPhone("+88012abc5678")).toBeNull();
    expect(normalizeWhatsAppPhone("+12345")).toBeNull();
  });

  it("accepts up to five HTTPS social profile links and rejects unsafe URLs", () => {
    expect(normalizeAffiliateSocialMedia("  ")).toBeNull();
    expect(normalizeAffiliateSocialMedia(" https://youtube.com/@creator \nhttps://instagram.com/creator "))
      .toBe("https://youtube.com/@creator\nhttps://instagram.com/creator");
    expect(normalizeAffiliateSocialMedia("http://example.com/profile")).toBeUndefined();
    expect(normalizeAffiliateSocialMedia("https://user:pass@example.com/profile")).toBeUndefined();
    expect(normalizeAffiliateSocialMedia(Array.from({ length: 6 }, (_, index) => `https://social${index}.example/profile`).join("\n")))
      .toBeUndefined();
  });

  it("calculates rounded commissions with safe integer arithmetic", () => {
    expect(calculateAffiliateCommissionCents(10001, 1000)).toBe(1000);
    expect(calculateAffiliateCommissionCents(50, 1000)).toBe(5);
    expect(calculateAffiliateCommissionCents(-1, 1000)).toBe(0);
    expect(calculateAffiliateCommissionCents(Number.MAX_SAFE_INTEGER, 10000)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
