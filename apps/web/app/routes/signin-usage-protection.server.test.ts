import { describe, expect, it, vi } from "vitest";
import { action } from "./signin";

describe("sign-in identity protection", () => {
  it("shares one per-email limit across sign-in and sign-up intents", async () => {
    const counts = new Map<string, number>();
    const limit = vi.fn(async ({ key }: { key: string }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= 5 };
    });
    const context = {
      cf: {
        env: {
          AUTH_IDENTITY_LIMITER: { limit },
          NEXT_PUBLIC_RECAPTCHA_SITE_KEY: "test-site-key",
          RECAPTCHA_SECRET_KEY: "test-secret",
        },
      },
    };
    const results: Array<Record<string, unknown>> = [];

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const form = new FormData();
      form.set("intent", attempt % 2 === 0 ? "signin" : "signup");
      form.set("email", "  Limit@Example.com ");
      form.set("password", "not-a-real-password");
      const request = new Request("http://localhost:3002/signin", { method: "POST", body: form });

      results.push(await action({ request, context, params: {} } as Parameters<typeof action>[0]) as Record<string, unknown>);
    }

    expect(limit).toHaveBeenCalledTimes(6);
    expect(new Set(limit.mock.calls.map(([input]) => input.key)).size).toBe(1);
    expect(results.slice(0, 5).every((result) => String(result.error).includes("Security check expired"))).toBe(true);
    expect(results[5].error).toBe("Too many attempts for this account. Wait a minute and try again.");
  });
});
