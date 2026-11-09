import { describe, expect, it } from "vitest";
import { loader } from "./auth-google-callback";

describe("Google OAuth callback", () => {
  it("fails closed for missing state and returns to sign-in", async () => {
    const response = await loader({
      request: new Request("http://localhost:3002/api/auth/callback/google?code=not-used&state=invalid"),
      context: { cf: { env: { NODE_ENV: "development", SESSION_SECRET: "test-session-secret", APP_URL: "http://localhost:3002" } } },
      params: {},
    } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/signin?error=google-state");
  });
});
