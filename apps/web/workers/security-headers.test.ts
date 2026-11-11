import { describe, expect, it } from "vitest";
import { withSecurityHeaders, withStaticCacheHeaders } from "./security-headers";

describe("deployed response security", () => {
  it.each([404, 503])("does not cache asset failures carrying inherited immutable headers: %s", async status => {
    const response = withStaticCacheHeaders(new Response("Unavailable", {
      status,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    }), "/assets/player-release.js");
    expect(response.status).toBe(status);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Unavailable");
  });
  it("preserves conditional asset responses", () => {
    const response = withStaticCacheHeaders(new Response(null, {
      status: 304,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    }), "/assets/player-release.js");
    expect(response.status).toBe(304);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
  });
  it.each(["/", "/signin", "/dashboard", "/dashboard/projects/project-id", "/site/node-logmin/projects/project-id"])("permits consent-based, same-origin voice recording throughout an HTML SPA entry: %s",path=>{
    const response=withSecurityHeaders(new Response("page",{headers:{"Content-Type":"text/html; charset=utf-8"}}),new Request(`https://edicut.com${path}`));
    expect(response.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(self), geolocation=(), payment=(), usb=()");
  });
  it.each(["application/json","audio/webm","video/mp4"])("keeps microphone requests disabled on resource responses: %s",mime=>{
    const response=withSecurityHeaders(new Response("resource",{headers:{"Content-Type":mime}}),new Request("https://edicut.com/api/project-reviews/project?voice=comment"));
    expect(response.headers.get("Permissions-Policy")).toContain("microphone=()");
  });
  it("does not enable microphones on static HTML assets",()=>{
    const response=withSecurityHeaders(new Response("asset",{headers:{"Content-Type":"text/html"}}),new Request("https://edicut.com/asset.html"),true);
    expect(response.headers.get("Permissions-Policy")).toContain("microphone=()");
  });
  it.each(["/dashboard", "/dashboard.data", "/dashboard/projects", "/checkout/creator", "/api/chat", "/auth/google", "/signout", "/site/node-logmin"]) ("prevents private responses and redirects from being cached: %s", path => {
    const response = withSecurityHeaders(new Response(null, { status: 302, headers: { Location: "/signin", "Cache-Control": "public, max-age=3600" } }), new Request(`https://edicut.com${path}`));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("allows the Google OAuth form redirect while keeping form targets allowlisted", () => {
    const response = withSecurityHeaders(
      new Response(null, { status: 302, headers: { Location: "https://accounts.google.com/o/oauth2/v2/auth" } }),
      new Request("https://edicut.com/auth/google", { method: "POST" }),
    );
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    expect(policy.split(";").map(value => value.trim()).find(value => value.startsWith("form-action ")))
      .toBe("form-action 'self' https://accounts.google.com");
  });
  it("marks personalized public-page HTML and cookie-setting responses no-store", () => {
    expect(withSecurityHeaders(new Response("page"), new Request("https://edicut.com/", { headers: { Cookie: "_session=signed-value" } })).headers.get("Cache-Control")).toBe("no-store");
    expect(withSecurityHeaders(new Response("page", { headers: { "Set-Cookie": "_session=signed-value" } }), new Request("https://edicut.com/")).headers.get("Cache-Control")).toBe("no-store");
  });
  it("preserves a route's stricter referrer policy and download sandbox", () => {
    const response = withSecurityHeaders(new Response("file", { headers: { "Referrer-Policy": "no-referrer", "Content-Security-Policy": "sandbox; default-src 'none'" } }), new Request("https://edicut.com/api/chat?file=private"));
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Content-Security-Policy")).toContain(", sandbox; default-src 'none'");
  });
  it("keeps public asset caching independent of authentication cookies", () => {
    const request = new Request("https://edicut.com/assets/admin-AbCd1234.js", { headers: { Cookie: "_session=signed-value" } });
    const response = withSecurityHeaders(withStaticCacheHeaders(new Response("asset"), new URL(request.url).pathname), request, true);
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("enforces HTTPS and framing headers without trusting weaker route policies", () => {
    const response = withSecurityHeaders(new Response("page", { headers: { "Referrer-Policy": "unsafe-url" } }), new Request("https://edicut.com/"));
    expect(response.headers.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
  it("allows Cloudflare's injected analytics beacon while keeping same-origin beacon requests", () => {
    const response = withSecurityHeaders(new Response("page"), new Request("https://edicut.com/"));
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    expect(policy).toMatch(/script-src[^;]*https:\/\/static\.cloudflareinsights\.com/);
    expect(policy).toMatch(/connect-src[^;]*'self'/);
  });
  it("allows the consent-gated Google Tag Manager loader and Analytics collection endpoints", () => {
    const response = withSecurityHeaders(new Response("page"), new Request("https://edicut.com/"));
    const policy = response.headers.get("Content-Security-Policy") ?? "";
    expect(policy).toMatch(/script-src[^;]*https:\/\/www\.googletagmanager\.com/);
    expect(policy).toMatch(/connect-src[^;]*https:\/\/\*\.google-analytics\.com/);
    expect(policy).toMatch(/connect-src[^;]*https:\/\/analytics\.google\.com/);
  });
});
