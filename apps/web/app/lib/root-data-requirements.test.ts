import { describe, expect, it } from "vitest";
import { shouldLoadPromoBarSettings, shouldLoadRootSiteSettings } from "./root-data-requirements";

describe("shouldLoadPromoBarSettings", () => {
  it.each(["/", "/pricing", "/pricing/creator", "/portfolio", "/contact", "/faq", "/privacy", "/terms"])(
    "loads promo settings for public marketing pages such as %s",
    (pathname) => expect(shouldLoadPromoBarSettings(pathname)).toBe(true),
  );

  it.each([
    "/site/node-logmin",
    "/site/node-logmin/login",
    "/site/node-logmin/account",
    "/dashboard",
    "/dashboard/profile",
    "/signin",
    "/forgot-password",
    "/update-password",
    "/auth/google",
    "/api/auth/callback/google",
    "/checkout/creator",
    "/maintenance",
    "/health",
    "/favicon.ico",
    "/robots.txt",
  ])("skips promo settings for non-marketing routes: %s", (pathname) => {
    expect(shouldLoadPromoBarSettings(pathname)).toBe(false);
  });
});

describe("shouldLoadRootSiteSettings", () => {
  it.each(["/", "/signin", "/dashboard", "/site/node-logmin"])(
    "loads shared root settings for app pages such as %s",
    (pathname) => expect(shouldLoadRootSiteSettings(pathname)).toBe(true),
  );

  it.each([
    "/auth/google",
    "/api/auth/callback/google",
    "/health",
    "/favicon.ico",
    "/robots.txt",
  ])("skips the shared settings read for resource endpoints: %s", (pathname) => {
    expect(shouldLoadRootSiteSettings(pathname)).toBe(false);
  });
});
