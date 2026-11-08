import { describe, expect, it } from "vitest";
import { shouldEnableSiteMotion, shouldTransitionBetweenRoutes, shouldUseWorkspaceLoader } from "./site-motion";

describe("shouldEnableSiteMotion", () => {
  it.each(["/", "/pricing", "/pricing/creator", "/portfolio", "/contact", "/faq", "/privacy", "/terms"])(
    "keeps site motion available on public pages such as %s",
    (pathname) => expect(shouldEnableSiteMotion(pathname)).toBe(true),
  );

  it.each([
    "/logo-animation",
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

describe("shouldTransitionBetweenRoutes", () => {
  it.each([
    ["/", "/signin"],
    ["/pricing", "/forgot-password"],
    ["/", "/auth/google"],
    ["/signin", "/dashboard"],
  ])("does not cover account-flow navigation from %s to %s", (from, to) => {
    expect(shouldTransitionBetweenRoutes(from, to)).toBe(false);
  });

  it.each([
    ["/", "/pricing"],
    ["/portfolio", "/services"],
  ])("keeps transitions between public pages from %s to %s", (from, to) => {
    expect(shouldTransitionBetweenRoutes(from, to)).toBe(true);
  });
});

describe("workspace loading feedback", () => {
  it.each(["/dashboard", "/dashboard/projects", "/dashboard/messages", "/site/node-logmin", "/site/node-logmin/quotes", "/site/node-logmin/users/client-id"])(
    "uses the workspace loader for %s", pathname => expect(shouldUseWorkspaceLoader(pathname)).toBe(true),
  );
  it.each(["/", "/pricing", "/checkout/creator", "/signin", "/site/node-logmin/login", "/site/node-logmin/access", "/dashboard-other", "/site/node-logmin-other"])(
    "keeps non-dashboard flows separate: %s", pathname => expect(shouldUseWorkspaceLoader(pathname)).toBe(false),
  );
});
