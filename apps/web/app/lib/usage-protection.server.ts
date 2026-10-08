type RuntimeRateLimitContext = {
  cf?: { env?: Record<string, unknown> };
  cloudflare?: { env?: Record<string, unknown> };
};

type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type LocalRateLimitBucket = {
  windowStart: number;
  windowEndsAt: number;
  count: number;
};

export type UsageLimitResult = "allowed" | "limited" | "unavailable";

const MAX_LOCAL_RATE_LIMIT_KEYS = 10_000;

export const MAX_DEFAULT_BODY_BYTES = 1 * 1024 * 1024;
export const MAX_SMALL_FORM_BODY_BYTES = 64 * 1024;
export const MAX_ADMIN_UPLOAD_BODY_BYTES = 56 * 1024 * 1024;

type BoundedRequest = {
  request: Request;
  exceeded: () => boolean;
};

type WorkerEnvironment = Record<string, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var __edicutLocalUsageLimits: Map<string, LocalRateLimitBucket> | undefined;
  // eslint-disable-next-line no-var
  var __edicutLocalUsageLimitChecks: number | undefined;
}

/**
 * Consume a Cloudflare rate-limit binding, with a bounded process-local fallback
 * for local development where Worker bindings are not present.
 */
export async function consumeUsageLimit({
  context,
  request,
  bindingName,
  key,
  localLimit,
  localPeriodSeconds,
}: {
  context: unknown;
  request: Request;
  bindingName: string;
  key: string;
  localLimit: number;
  localPeriodSeconds: number;
}): Promise<UsageLimitResult> {
  const runtimeContext = context as RuntimeRateLimitContext | undefined;
  const env = runtimeContext?.cf?.env ?? runtimeContext?.cloudflare?.env;
  const binding = env?.[bindingName] as RateLimitBinding | undefined;

  if (binding && typeof binding.limit === "function") {
    try {
      const result = await binding.limit({ key });
      return result.success ? "allowed" : "limited";
    } catch {
      return "unavailable";
    }
  }

  if (!isLocalDevelopmentHost(request)) {
    return "unavailable";
  }

  return consumeLocalLimit(bindingName, key, localLimit, localPeriodSeconds);
}

export async function hashUsageLimitKey(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requestBodyExceedsLimit(request: Request, maximumBytes: number) {
  const value = request.headers.get("content-length");
  if (value === null) return false;

  if (!/^\d+$/.test(value)) return true;
  const size = Number(value);
  return !Number.isSafeInteger(size) || size > maximumBytes;
}

function isLocalDevelopmentHost(request: Request) {
  const hostname = new URL(request.url).hostname.toLowerCase();
  return hostname === "localhost"
    || hostname.endsWith(".localhost")
    || hostname === "127.0.0.1"
    || hostname === "[::1]";
}

function consumeLocalLimit(bindingName: string, key: string, limit: number, periodSeconds: number): UsageLimitResult {
  const now = Date.now();
  const periodMs = Math.max(1, periodSeconds) * 1_000;
  const windowStart = Math.floor(now / periodMs) * periodMs;
  const store = (globalThis.__edicutLocalUsageLimits ??= new Map());
  const storeKey = `${bindingName}:${key}`;
  let bucket = store.get(storeKey);

  const checks = (globalThis.__edicutLocalUsageLimitChecks = (globalThis.__edicutLocalUsageLimitChecks ?? 0) + 1);
  if (checks % 128 === 0) {
    for (const [entryKey, entry] of store) {
      if (entry.windowEndsAt <= now) store.delete(entryKey);
    }
  }

  if (!bucket || bucket.windowStart !== windowStart) {
    if (store.size >= MAX_LOCAL_RATE_LIMIT_KEYS) {
      for (const [entryKey, entry] of store) {
        if (entry.windowEndsAt <= now) store.delete(entryKey);
      }
      if (store.size >= MAX_LOCAL_RATE_LIMIT_KEYS) return "limited";
    }

    bucket = { windowStart, windowEndsAt: windowStart + periodMs, count: 0 };
    store.set(storeKey, bucket);
  }

  if (bucket.count >= limit) return "limited";
  bucket.count += 1;
  return "allowed";
}

/** Apply request-wide Cloudflare Worker rate limits before the route handler runs. */
export async function enforceEdgeRequestLimits(request: Request, env: WorkerEnvironment): Promise<Response | null> {
  const pathname = normalizePathname(new URL(request.url).pathname).toLowerCase();
  const clientKey = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase());
  const checks: Array<{ binding: string; key: string }> = [
    { binding: "APP_REQUEST_LIMITER", key: clientKey },
  ];

  if (isMutation) checks.push({ binding: "APP_MUTATION_LIMITER", key: clientKey });

  if ((isMutation && isAuthPath(pathname)) || pathname === "/auth/google" || pathname === "/api/auth/callback/google") {
    checks.push({ binding: "AUTH_REQUEST_LIMITER", key: clientKey });
  }

  if (isMutation && (pathname === "/" || pathname === "/contact")) {
    checks.push({ binding: "PUBLIC_FORM_LIMITER", key: clientKey });
  }

  if (
    isMutation &&
    pathname === "/site/node-logmin" &&
    request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")
  ) {
    checks.push({ binding: "ADMIN_MULTIPART_LIMITER", key: clientKey });
  }

  for (const check of checks) {
    const binding = env[check.binding] as RateLimitBinding | undefined;
    if (!binding || typeof binding.limit !== "function") {
      console.error(`Required request protection binding is missing: ${check.binding}`);
      return usageProtectionUnavailableResponse();
    }

    try {
      const result = await binding.limit({ key: check.key });
      if (!result.success) return rateLimitedResponse();
    } catch (error) {
      console.error(`Request protection binding failed: ${check.binding}`, error);
      return usageProtectionUnavailableResponse();
    }
  }

  return null;
}

export function normalizePathname(pathname: string) {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Keep malformed escapes intact; they will not match a sensitive route.
  }
  const collapsed = decoded.replace(/\/+/g, "/").replace(/\/$/, "");
  return collapsed || "/";
}

function isAuthPath(pathname: string) {
  return [
    "/signin",
    "/forgot-password",
    "/update-password",
    "/site/node-logmin/login",
    "/auth/google",
    "/api/auth/callback/google",
  ].includes(pathname);
}

export function getMaximumBodyBytes(pathname: string, method: string, request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return null;
  if (pathname === "/api/chat") return 5 * 1024 * 1024 + 32 * 1024;
  if (pathname === "/site/node-logmin") {
    return request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")
      ? MAX_ADMIN_UPLOAD_BODY_BYTES
      : MAX_DEFAULT_BODY_BYTES;
  }
  if (pathname.startsWith("/site/node-logmin/users/")) return 2 * 1024 * 1024;
  if (pathname.startsWith("/site/node-logmin/")) return MAX_SMALL_FORM_BODY_BYTES;
  if (isAuthPath(pathname) || pathname === "/" || pathname === "/contact") return MAX_SMALL_FORM_BODY_BYTES;
  return MAX_DEFAULT_BODY_BYTES;
}

export function limitRequestBody(request: Request, maximumBytes: number): BoundedRequest {
  if (!request.body || ["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {
    return { request, exceeded: () => false };
  }

  let bytesRead = 0;
  let exceeded = false;
  const reader = request.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        bytesRead += value.byteLength;
        if (bytesRead > maximumBytes) {
          exceeded = true;
          await reader.cancel();
          controller.close();
          return;
        }

        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  return {
    request: new Request(request, { body, duplex: "half" } as unknown as RequestInit),
    exceeded: () => exceeded,
  };
}

export function rateLimitedResponse() {
  return new Response(JSON.stringify({ error: "Too many requests. Please wait a minute and try again." }), {
    status: 429,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": "60",
    },
  });
}

export function usageProtectionUnavailableResponse() {
  return new Response(JSON.stringify({ error: "Usage protection is temporarily unavailable. Please try again shortly." }), {
    status: 503,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Retry-After": "60",
    },
  });
}

export function requestTooLargeResponse() {
  return new Response(JSON.stringify({ error: "This request is larger than the site allows." }), {
    status: 413,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
