import { describe, expect, it } from "vitest";
import { issueAuthCsrfToken, verifyAuthCsrfToken } from "./session.server";

function cookiePair(setCookie: string | null) {
  if (!setCookie) throw new Error("Expected the auth CSRF cookie to be issued.");
  return setCookie.split(";", 1)[0];
}

describe("authentication CSRF protection", () => {
  it("accepts a valid signed form token when Origin is opaque and fetch metadata is absent", async () => {
    const page = new Request("http://localhost:3002/signin");
    const csrf = await issueAuthCsrfToken(page);
    expect(csrf.setCookie).toContain("HttpOnly");
    expect(csrf.setCookie).toContain("SameSite=Strict");
    const request = new Request("http://localhost:3002/auth/google", {
      method: "POST",
      headers: { Cookie: cookiePair(csrf.setCookie), Origin: "null", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: csrf.token }),
    });

    expect(await verifyAuthCsrfToken(request, csrf.token)).toBe(true);
  });

  it("rejects forged form tokens and explicit cross-site submissions", async () => {
    const csrf = await issueAuthCsrfToken(new Request("http://localhost:3002/signin"));
    const cookie = cookiePair(csrf.setCookie);
    const forged = new Request("http://localhost:3002/signin", {
      method: "POST",
      headers: { Cookie: cookie },
      body: "intent=signin",
    });
    const crossSite = new Request("http://localhost:3002/signin", {
      method: "POST",
      headers: { Cookie: cookie, "Sec-Fetch-Site": "cross-site" },
      body: "intent=signin",
    });

    expect(await verifyAuthCsrfToken(forged, "forged-token")).toBe(false);
    expect(await verifyAuthCsrfToken(crossSite, csrf.token)).toBe(false);
  });

  it("reuses a valid token across auth page loads", async () => {
    const first = await issueAuthCsrfToken(new Request("http://localhost:3002/signin"));
    const second = await issueAuthCsrfToken(new Request("http://localhost:3002/signin", {
      headers: { Cookie: cookiePair(first.setCookie) },
    }));

    expect(second.token).toBe(first.token);
    expect(second.setCookie).toBeNull();
  });

  it("marks the signed CSRF cookie Secure in production", async () => {
    const request = new Request("https://edicut.com/signin");
    const csrf = await issueAuthCsrfToken(request, {
      cf: { env: { NODE_ENV: "production", SESSION_SECRET: "production-test-secret" } },
    });

    expect(csrf.setCookie).toContain("Secure");
    expect(csrf.setCookie).toContain("HttpOnly");
  });
});
