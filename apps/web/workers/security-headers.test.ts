import { describe, expect, it } from "vitest";
import { withSecurityHeaders, withStaticCacheHeaders } from "./security-headers";

describe("deployed response security", () => {
  it.each(["/dashboard", "/dashboard.data", "/dashboard/projects", "/checkout/creator", "/api/chat", "/auth/google", "/signout", "/site/node-logmin"]) ("prevents private responses and redirects from being cached: %s", path => {
    const response = withSecurityHeaders(new Response(null, { status: 302, headers: { Location: "/signin", "Cache-Control": "public, max-age=3600" } }), new Request(`https://edicut.com${path}`));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
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
});
