import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/index.js";
import { createWebLoadContext } from "../app/lib/context.server";
import {
  enforceEdgeRequestLimits,
  getMaximumBodyBytes,
  limitRequestBody,
  normalizePathname,
  requestBodyExceedsLimit,
  requestTooLargeResponse,
} from "../app/lib/usage-protection.server";
import { isImmutableAssetPath, shouldServeStaticAsset } from "./static-assets";
import { authorizeChatSocket } from "../app/lib/chat-socket.server";
export { ChatSocketHub } from "./chat-socket";

type WorkerEnvironment = Record<string, unknown> & {
  ASSETS?: Fetcher;
  CHAT_SOCKET_HUB?: DurableObjectNamespace;
};

const handleRequest = createRequestHandler({
    build,
    getLoadContext({ context }) {
      return createWebLoadContext({
      env: context.cloudflare.env as unknown as Record<string, string | undefined>,
      ctx: context.cloudflare.ctx as ExecutionContext,
    });
  },
});

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https: https://*.cloudinary.com https://res.cloudinary.com",
  "connect-src 'self' wss://edicut.com https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https://*.cloudinary.com https://www.google.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
].join("; ");

function withStaticCacheHeaders(response: Response, pathname: string) {
  if (!response.ok) {
    return response;
  }

  const headers = new Headers(response.headers);

  if (isImmutableAssetPath(pathname)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  }

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSecurityHeaders(response: Response, request: Request) {
  const headers = new Headers(response.headers);
  const routePolicy = headers.get("Content-Security-Policy");
  // Enforce both policies so private downloads keep their stricter sandbox.
  headers.set("Content-Security-Policy", routePolicy && routePolicy !== CONTENT_SECURITY_POLICY
    ? `${CONTENT_SECURITY_POLICY}, ${routePolicy}` : CONTENT_SECURITY_POLICY);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");

  const url = new URL(request.url);
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (
    url.pathname.startsWith("/site/node-logmin") ||
    url.pathname.startsWith("/signin") ||
    url.pathname.startsWith("/forgot-password") ||
    url.pathname.startsWith("/update-password")
  ) {
    headers.set("Cache-Control", "no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(
    request: Request,
    env: WorkerEnvironment,
    ctx: ExecutionContext
  ) {
    const url = new URL(request.url);
    const pathname = normalizePathname(url.pathname).toLowerCase();

    if (url.hostname === "www.edicut.com") {
      url.hostname = "edicut.com";
      return Response.redirect(url.toString(), 308);
    }

    const isStaticAssetRequest = shouldServeStaticAsset(request.method, pathname);

    if (isStaticAssetRequest && env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request.url, request);
      return withSecurityHeaders(withStaticCacheHeaders(assetResponse, url.pathname), request);
    }

    const edgeLimit = await enforceEdgeRequestLimits(request, env);
    if (edgeLimit) return withSecurityHeaders(edgeLimit, request);

    if (pathname === "/api/chat/socket") {
      if (!env.CHAT_SOCKET_HUB) return withSecurityHeaders(new Response("Live chat is temporarily unavailable", { status: 503 }), request);
      try {
        const actor = await authorizeChatSocket(request, createWebLoadContext({ env: env as Record<string, string | undefined>, ctx }));
        // Preserve the original 101 response and its webSocket property.
        return env.CHAT_SOCKET_HUB.get(env.CHAT_SOCKET_HUB.idFromName(actor.key)).fetch(request);
      } catch (error) {
        return withSecurityHeaders(error instanceof Response ? error : new Response("Chat connection unavailable", { status: 503 }), request);
      }
    }

    const maximumBodyBytes = getMaximumBodyBytes(pathname, request.method, request);
    if (maximumBodyBytes !== null) {
      if (requestBodyExceedsLimit(request, maximumBodyBytes)) {
        return withSecurityHeaders(requestTooLargeResponse(), request);
      }
    }

    const boundedRequest = maximumBodyBytes === null
      ? { request, exceeded: () => false }
      : limitRequestBody(request, maximumBodyBytes);

    let response: Response;
    try {
      response = await handleRequest({
        request: boundedRequest.request,
        env,
        waitUntil: ctx.waitUntil.bind(ctx),
        passThroughOnException: "passThroughOnException" in ctx && typeof ctx.passThroughOnException === "function"
          ? ctx.passThroughOnException.bind(ctx)
          : () => {},
        data: {},
        params: {},
      });
    } catch (error) {
      if (!boundedRequest.exceeded()) throw error;
      return withSecurityHeaders(requestTooLargeResponse(), request);
    }

    if (boundedRequest.exceeded()) {
      return withSecurityHeaders(requestTooLargeResponse(), request);
    }

    return withSecurityHeaders(response, request);
  },
};
