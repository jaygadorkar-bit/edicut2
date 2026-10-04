import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeUsageLimit,
  enforceEdgeRequestLimits,
  getMaximumBodyBytes,
  hashUsageLimitKey,
  limitRequestBody,
  normalizePathname,
  requestBodyExceedsLimit,
} from "./usage-protection.server";

const RATE_LIMIT_BINDINGS = [
  "APP_REQUEST_LIMITER",
  "APP_MUTATION_LIMITER",
  "AUTH_REQUEST_LIMITER",
  "PUBLIC_FORM_LIMITER",
  "ADMIN_MULTIPART_LIMITER",
];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("consumeUsageLimit", () => {
  it("uses the Worker binding and forwards the requested key", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    const result = await consumeUsageLimit({
      context: { cf: { env: { IDENTITY_LIMITER: { limit } } } },
      request: new Request("https://edicut.com/signin"),
      bindingName: "IDENTITY_LIMITER",
      key: "identity-hash",
      localLimit: 5,
      localPeriodSeconds: 60,
    });

    expect(result).toBe("allowed");
    expect(limit).toHaveBeenCalledExactlyOnceWith({ key: "identity-hash" });
  });

  it("supports the alternate Cloudflare context shape and returns limited", async () => {
    const limit = vi.fn().mockResolvedValue({ success: false });
    const result = await consumeUsageLimit({
      context: { cloudflare: { env: { IDENTITY_LIMITER: { limit } } } },
      request: new Request("https://edicut.com/signin"),
      bindingName: "IDENTITY_LIMITER",
      key: "account",
      localLimit: 5,
      localPeriodSeconds: 60,
    });

    expect(result).toBe("limited");
  });

  it("fails closed when a hosted binding is missing or throws", async () => {
    const request = new Request("https://preview.edicut-web.workers.dev/signin");
    const common = { request, bindingName: "IDENTITY_LIMITER", key: "account", localLimit: 5, localPeriodSeconds: 60 };
    const failingLimit = vi.fn().mockRejectedValue(new Error("binding unavailable"));

    await expect(consumeUsageLimit({ context: {}, ...common })).resolves.toBe("unavailable");
    await expect(consumeUsageLimit({ context: { cf: { env: { IDENTITY_LIMITER: { limit: failingLimit } } } }, ...common }))
      .resolves.toBe("unavailable");
  });

  it("applies bounded local development limits and resets at the next window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-03T00:00:00.000Z"));
    const request = new Request("http://localhost:3002/signin");
    const common = {
      context: {},
      request,
      bindingName: `TEST_LIMIT_${crypto.randomUUID()}`,
      key: "same-key",
      localLimit: 2,
      localPeriodSeconds: 1,
    };

    await expect(consumeUsageLimit(common)).resolves.toBe("allowed");
    await expect(consumeUsageLimit(common)).resolves.toBe("allowed");
    await expect(consumeUsageLimit(common)).resolves.toBe("limited");
    vi.advanceTimersByTime(1_000);
    await expect(consumeUsageLimit(common)).resolves.toBe("allowed");
  });

  it("caps local limiter memory and recovers expired entries", async () => {
    type TestBucket = { windowStart: number; windowEndsAt: number; count: number };
    const globals = globalThis as typeof globalThis & {
      __edicutLocalUsageLimits?: Map<string, TestBucket>;
      __edicutLocalUsageLimitChecks?: number;
    };
    const previousStore = globals.__edicutLocalUsageLimits;
    const previousChecks = globals.__edicutLocalUsageLimitChecks;
    const now = Date.now();
    const request = new Request("http://localhost:3002/signin");

    try {
      globals.__edicutLocalUsageLimits = new Map(Array.from({ length: 10_000 }, (_, index) => [
        `active:${index}`,
        { windowStart: now, windowEndsAt: now + 60_000, count: 1 },
      ]));
      globals.__edicutLocalUsageLimitChecks = 0;
      await expect(consumeUsageLimit({
        context: {}, request, bindingName: "CAPACITY_TEST", key: "new-key", localLimit: 1, localPeriodSeconds: 60,
      })).resolves.toBe("limited");
      expect(globals.__edicutLocalUsageLimits.size).toBe(10_000);

      globals.__edicutLocalUsageLimits = new Map(Array.from({ length: 10_000 }, (_, index) => [
        `expired:${index}`,
        { windowStart: now - 60_000, windowEndsAt: now - 1, count: 1 },
      ]));
      await expect(consumeUsageLimit({
        context: {}, request, bindingName: "CAPACITY_TEST", key: "recovered-key", localLimit: 1, localPeriodSeconds: 60,
      })).resolves.toBe("allowed");
      expect(globals.__edicutLocalUsageLimits.size).toBe(1);
    } finally {
      globals.__edicutLocalUsageLimits = previousStore;
      globals.__edicutLocalUsageLimitChecks = previousChecks;
    }
  });

  it("hashes identities without returning the original value", async () => {
    const first = await hashUsageLimitKey("User@Example.com");
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(first).toBe(await hashUsageLimitKey("User@Example.com"));
    expect(first).not.toBe(await hashUsageLimitKey("other@example.com"));
    expect(first).not.toContain("User");
  });
});

describe("Worker request limits", () => {
  it("normalizes encoded, repeated, trailing, and case-variant paths", () => {
    expect(normalizePathname("//SITE/%6EODE-LOGMIN/users//42/")).toBe("/SITE/nODE-LOGMIN/users/42");
    expect(normalizePathname("/%2Fsignin")).toBe("/signin");
  });

  it("chooses body caps by route and allows bodyless methods", () => {
    const form = (url: string, contentType = "application/x-www-form-urlencoded") => new Request(url, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: "x",
    });

    expect(getMaximumBodyBytes("/signin", "POST", form("https://edicut.com/signin"))).toBe(64 * 1024);
    expect(getMaximumBodyBytes("/contact", "POST", form("https://edicut.com/contact"))).toBe(64 * 1024);
    expect(getMaximumBodyBytes("/site/node-logmin/infrastructure", "POST", form("https://edicut.com/site/node-logmin/infrastructure")))
      .toBe(64 * 1024);
    expect(getMaximumBodyBytes("/site/node-logmin/users/42", "POST", form("https://edicut.com/site/node-logmin/users/42")))
      .toBe(2 * 1024 * 1024);
    expect(getMaximumBodyBytes("/site/node-logmin", "POST", form("https://edicut.com/site/node-logmin", "multipart/form-data; boundary=test")))
      .toBe(56 * 1024 * 1024);
    expect(getMaximumBodyBytes("/dashboard/messages", "POST", form("https://edicut.com/dashboard/messages")))
      .toBe(1024 * 1024);
    expect(getMaximumBodyBytes("/signin", "GET", new Request("https://edicut.com/signin"))).toBeNull();
  });

  it("rejects over-limit, malformed, and unsafe Content-Length values at the boundary", () => {
    const requestWithLength = (length: string) => new Request("https://edicut.com/signin", {
      method: "POST",
      headers: { "Content-Length": length },
      body: "x",
    });

    expect(requestBodyExceedsLimit(requestWithLength("65536"), 65_536)).toBe(false);
    expect(requestBodyExceedsLimit(requestWithLength("65537"), 65_536)).toBe(true);
    expect(requestBodyExceedsLimit(requestWithLength("-1"), 65_536)).toBe(true);
    expect(requestBodyExceedsLimit(requestWithLength("9007199254740992"), 65_536)).toBe(true);
    expect(requestBodyExceedsLimit(new Request("https://edicut.com/signin", { method: "POST", body: "x" }), 1))
      .toBe(false);
  });

  it("limits streamed bodies even when Content-Length is absent", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request("https://edicut.com/signin", {
      method: "POST",
      body,
      duplex: "half",
    } as unknown as RequestInit);
    const bounded = limitRequestBody(request, 3);

    expect(Array.from(new Uint8Array(await bounded.request.arrayBuffer()))).toEqual([1, 2]);
    expect(bounded.exceeded()).toBe(true);
    expect(cancelled).toBe(true);
  });

  it("allows a streamed body that exactly matches its maximum", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    });
    const request = new Request("https://edicut.com/signin", {
      method: "POST",
      body,
      duplex: "half",
    } as unknown as RequestInit);
    const bounded = limitRequestBody(request, 3);

    expect(Array.from(new Uint8Array(await bounded.request.arrayBuffer()))).toEqual([1, 2, 3]);
    expect(bounded.exceeded()).toBe(false);
  });

  it("applies request, mutation, auth, form, and multipart bindings to the intended traffic", async () => {
    const calls: Array<{ name: string; key: string }> = [];
    const env = Object.fromEntries(RATE_LIMIT_BINDINGS.map((name) => [name, {
      limit: vi.fn(async ({ key }: { key: string }) => {
        calls.push({ name, key });
        return { success: true };
      }),
    }]));
    const request = new Request("https://edicut.com/contact", {
      method: "POST",
      headers: {
        "CF-Connecting-IP": "203.0.113.7",
        "Content-Type": "multipart/form-data; boundary=test",
      },
      body: "--test--",
    });

    await expect(enforceEdgeRequestLimits(request, env)).resolves.toBeNull();
    expect(calls).toEqual([
      { name: "APP_REQUEST_LIMITER", key: "203.0.113.7" },
      { name: "APP_MUTATION_LIMITER", key: "203.0.113.7" },
      { name: "PUBLIC_FORM_LIMITER", key: "203.0.113.7" },
    ]);

    calls.length = 0;
    const adminUpload = new Request("https://edicut.com/site/node-logmin", {
      method: "POST",
      headers: { "CF-Connecting-IP": "203.0.113.8", "Content-Type": "multipart/form-data; boundary=test" },
      body: "--test--",
    });
    await expect(enforceEdgeRequestLimits(adminUpload, env)).resolves.toBeNull();
    expect(calls.map(({ name }) => name)).toEqual([
      "APP_REQUEST_LIMITER",
      "APP_MUTATION_LIMITER",
      "ADMIN_MULTIPART_LIMITER",
    ]);
  });

  it("limits encoded auth endpoints and stops after the first denied binding", async () => {
    const deniedCalls: string[] = [];
    const env = Object.fromEntries(RATE_LIMIT_BINDINGS.map((name) => [name, {
      limit: vi.fn(async () => {
        deniedCalls.push(name);
        return { success: name !== "AUTH_REQUEST_LIMITER" };
      }),
    }]));
    const request = new Request("https://edicut.com/%73ignin/", {
      method: "POST",
      headers: { "CF-Connecting-IP": "203.0.113.9" },
      body: "intent=signin",
    });

    const response = await enforceEdgeRequestLimits(request, env);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    expect(response?.headers.get("Cache-Control")).toBe("no-store");
    expect(deniedCalls).toEqual(["APP_REQUEST_LIMITER", "APP_MUTATION_LIMITER", "AUTH_REQUEST_LIMITER"]);
  });

  it("fails closed with 503 when a Worker binding is absent or throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = new Request("https://edicut.com/health");
    const missing = await enforceEdgeRequestLimits(request, {});
    expect(missing?.status).toBe(503);
    expect(missing?.headers.get("Retry-After")).toBe("60");

    const throwing = await enforceEdgeRequestLimits(request, {
      APP_REQUEST_LIMITER: { limit: vi.fn().mockRejectedValue(new Error("temporarily unavailable")) },
    });
    expect(throwing?.status).toBe(503);
    expect(error).toHaveBeenCalledTimes(2);
  });
});
