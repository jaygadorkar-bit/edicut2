import { describe, expect, it } from "vitest";
import {
  AFFILIATE_REFERRAL_COOKIE,
  MARKETING_CONSENT_COOKIE,
  hasMarketingConsent,
  isAffiliateLandingPath,
  isReferralWithinWindow,
  readAffiliateReferral,
  serializeAffiliateReferral,
} from "./affiliate-referral.server";

const DAY = 86_400_000;
const context = { cf: { env: { NODE_ENV: "development" } } };
const referral = {
  code: "CREATOR-1",
  visitId: "11111111-1111-4111-8111-111111111111",
  campaign: "spring-launch",
  landingPath: "/pricing",
  issuedAt: 1_800_000_000_000,
  expiresAt: 1_800_000_000_000 + 30 * DAY,
};

async function cookieFor(value = referral) {
  const request = new Request("https://edicut.com/api/affiliate/referral");
  return serializeAffiliateReferral(request, context, value);
}

describe("affiliate referral cookie", () => {
  it("accepts a valid signed referral only with marketing consent", async () => {
    const cookie = await cookieFor();
    const request = new Request("https://edicut.com/", { headers: { Cookie: `${MARKETING_CONSENT_COOKIE}=yes; ${cookie.split(";")[0]}` } });
    expect(hasMarketingConsent(request)).toBe(true);
    expect(await readAffiliateReferral(request, context, referral.issuedAt + 1)).toEqual(referral);
  });

  it("rejects a tampered signature", async () => {
    const cookie = await cookieFor();
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");
    const tampered = `${name}=${value.slice(0, -1)}x`;
    const request = new Request("https://edicut.com/", { headers: { Cookie: `${MARKETING_CONSENT_COOKIE}=yes; ${tampered}` } });
    expect(await readAffiliateReferral(request, context, referral.issuedAt + 1)).toBeNull();
  });

  it("rejects missing or non-yes consent before reading the attribution cookie", async () => {
    const cookie = await cookieFor();
    const pair = cookie.split(";")[0];
    for (const consent of ["", `${MARKETING_CONSENT_COOKIE}=no`]) {
      const request = new Request("https://edicut.com/", { headers: { Cookie: [consent, pair].filter(Boolean).join("; ") } });
      expect(await readAffiliateReferral(request, context, referral.issuedAt + 1)).toBeNull();
    }
    expect(AFFILIATE_REFERRAL_COOKIE).toBe("edicut_referral");
  });

  it("rejects expired and not-yet-issued referrals", async () => {
    const expiredCookie = await cookieFor({ ...referral, expiresAt: referral.issuedAt + 1 });
    const expiredPair = expiredCookie.split(";")[0];
    const expired = new Request("https://edicut.com/", { headers: { Cookie: `${MARKETING_CONSENT_COOKIE}=yes; ${expiredPair}` } });
    expect(await readAffiliateReferral(expired, context, referral.issuedAt + 1)).toBeNull();

    const futureCookie = await cookieFor({ ...referral, issuedAt: referral.issuedAt + 100, expiresAt: referral.expiresAt + 100 });
    const future = new Request("https://edicut.com/", { headers: { Cookie: `${MARKETING_CONSENT_COOKIE}=yes; ${futureCookie.split(";")[0]}` } });
    expect(await readAffiliateReferral(future, context, referral.issuedAt)).toBeNull();
  });

  it("applies the program attribution window independently of cookie expiry", () => {
    const now = referral.issuedAt + 10 * DAY;
    expect(isReferralWithinWindow(referral, 30, now)).toBe(true);
    expect(isReferralWithinWindow(referral, 10, now)).toBe(false);
    expect(isReferralWithinWindow(referral, 30, referral.expiresAt)).toBe(false);
  });
});

describe("affiliate landing path allowlist", () => {
  it.each(["/", "/pricing", "/pricing/creator-pro", "/services/youtube-video-editing", "/portfolio", "/blog", "/blog/how-to-edit"])("allows %s", (path) => {
    expect(isAffiliateLandingPath(path)).toBe(true);
  });
  it.each(["https://evil.test/", "//evil.test", "/pricing?next=https://evil.test", "/pricing/../admin", "/dashboard", "/service", "/portfolio/extra", "/" + "a".repeat(160)])("rejects %s", (path) => {
    expect(isAffiliateLandingPath(path)).toBe(false);
  });
});
