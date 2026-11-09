import { describe, expect, it } from "vitest";
import { action, loader } from "./auth-google";

const context = { cf: { env: {
  NODE_ENV: "development",
  SESSION_SECRET: "test-session-secret",
  APP_URL: "http://localhost:3002",
  AUTH_GOOGLE_ID: "test-client-id",
  AUTH_GOOGLE_SECRET: "test-client-secret",
} } };

describe("Google OAuth initiation", () => {
  it("only starts from a same-origin POST", async () => {
    const response = await action({
      request: new Request("http://localhost:3002/auth/google", { method: "POST", headers: { Origin: "https://evil.example" } }),
      context,
      params: {},
    } as never);
    expect(response.status).toBe(403);
  });

  it("starts a bounded customer-only PKCE transaction", async () => {
    const body = new URLSearchParams({ mode: "admin", returnTo: "https://evil.example" });
    const response = await action({
      request: new Request("http://localhost:3002/auth/google", {
        method: "POST",
        headers: { Origin: "http://localhost:3002", "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }),
      context,
      params: {},
    } as never);
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("Location")!);
    expect(location.href).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(location.searchParams.get("code_challenge_method")).toBe("S256");
    expect(location.searchParams.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    const transaction = await (await import("../lib/session.server")).getGoogleOAuthCookie(context).parse(response.headers.get("Set-Cookie"));
    expect(transaction.mode).toBe("user");
    expect(transaction.returnTo).toBe("/dashboard");
  });

  it("does not start an OAuth transaction on direct GET", async () => {
    const response = loader({ request: new Request("http://localhost:3002/auth/google"), context, params: {} } as never);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3002/signin?error=google-unavailable");
  });
});
