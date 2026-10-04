import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const resetPasswordForEmail = vi.fn(async () => ({ error: null }));
  const getSupabaseClient = vi.fn(() => ({ auth: { resetPasswordForEmail } }));
  return { getSupabaseClient, resetPasswordForEmail };
});

vi.mock("../integrations/supabase/client.server", () => ({ getSupabaseClient: mocks.getSupabaseClient }));

import { action } from "./forgot-password";

beforeEach(() => vi.clearAllMocks());

describe("password reset usage protection", () => {
  it("sends at most one reset request per email in a minute", async () => {
    const counters = new Map<string, number>();
    const limit = vi.fn(async ({ key }: { key: string }) => {
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return { success: count <= 1 };
    });
    const context = { cf: { env: { PASSWORD_RESET_LIMITER: { limit } } }, env: { APP_URL: "http://localhost:3002" } };
    const results: Array<Record<string, unknown>> = [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const form = new FormData();
      form.set("email", "Reset@Example.com");
      const request = new Request("http://localhost:3002/forgot-password", { method: "POST", body: form });
      results.push(await action({ request, context, params: {} } as Parameters<typeof action>[0]) as Record<string, unknown>);
    }

    expect(limit).toHaveBeenCalledTimes(2);
    expect(limit.mock.calls[0]?.[0].key).toBe(limit.mock.calls[1]?.[0].key);
    expect(results[0]).toEqual({ sent: true });
    expect(results[1].error).toBe("A reset request was sent recently. Wait a minute before trying again.");
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledTimes(1);
  });
});
