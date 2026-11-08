import { describe, expect, it, vi } from "vitest";
import { readRealtimeAccessTokenClaims } from "./realtime-auth.server";

function token(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `header.${encoded}.signature`;
}

describe("Realtime access token claims", () => {
  it("returns only normalized email and expiry from a plausible token", () => {
    const claims = readRealtimeAccessTokenClaims(token({
      sub: "account-id",
      email: "Owner@Example.Test ",
      exp: Math.floor(Date.now() / 1_000) + 600,
      role: "authenticated",
    }));

    expect(claims?.email).toBe("owner@example.test");
    expect(claims?.expiresAt).toBeGreaterThan(Date.now());
    expect(claims).not.toHaveProperty("role");
    expect(claims).not.toHaveProperty("sub");
  });

  it.each([
    undefined,
    "opaque-token",
    `x.${btoa("not-json")}.y`,
    token({ email: "missing-sub@example.test", exp: Math.floor(Date.now() / 1_000) + 600 }),
    token({ sub: "user-id", email: "missing-exp@example.test" }),
    token({ sub: "user-id", email: "expired@example.test", exp: Math.floor(Date.now() / 1_000) - 5 }),
  ])("rejects missing, malformed, or expired tokens (%j)", (value) => {
    expect(readRealtimeAccessTokenClaims(value)).toBeNull();
  });

  it("rejects an oversized token before decoding it", () => {
    expect(readRealtimeAccessTokenClaims(`x.${"a".repeat(8_200)}.y`)).toBeNull();
  });
});
