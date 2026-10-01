import { describe, expect, it } from "vitest";
import { shouldEnableSiteMotion } from "./site-motion";

describe("shouldEnableSiteMotion", () => {
  it.each(["/", "/pricing", "/pricing/creator", "/portfolio", "/contact", "/faq", "/privacy", "/terms"])(
    "keeps site motion available on public pages such as %s",
    (pathname) => expect(shouldEnableSiteMotion(pathname)).toBe(true),
  );

  it.each([
    "/dashboard",
    "/dashboard/profile",
    "/dashboard/projects",
    "/site/node-logmin",
    "/site/node-logmin/account",
    "/signin",
    "/forgot-password",
    "/update-password",
    "/auth/google",
    "/api/auth/callback/google",
    "/checkout/creator",
  ])("keeps global site motion off for workspace and account routes: %s", (pathname) => {
    expect(shouldEnableSiteMotion(pathname)).toBe(false);
  });
});
