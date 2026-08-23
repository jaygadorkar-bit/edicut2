import { createRequestHandler } from "@react-router/cloudflare";
import * as build from "../build/server/index.js";
import { createWebLoadContext } from "../app/lib/context.server";

const handleRequest = createRequestHandler({
  build,
  getLoadContext({ context }) {
    return createWebLoadContext({
      env: context.cloudflare.env,
      ctx: context.cloudflare.ctx as ExecutionContext,
    });
  },
});

const IMMUTABLE_ASSET_PATH = /^\/assets\/.+\.[a-z0-9]+$/i;
const PUBLIC_ASSET_PATH = /^\/(?:images\/.+|icons\/.+|[^/]+\.(?:ico|svg|png|jpg|jpeg|webp|avif))$/i;
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
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https://*.cloudinary.com https://www.google.com",
  "frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
].join("; ");

function withStaticCacheHeaders(response: Response, pathname: string) {
  if (!response.ok) {
    return response;
  }

  const headers = new Headers(response.headers);

  if (IMMUTABLE_ASSET_PATH.test(pathname)) {
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
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");

  const url = new URL(request.url);
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (url.pathname.startsWith("/site/node-logmin") || url.pathname.startsWith("/signin")) {
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
    env: Record<string, string | undefined> & { ASSETS?: Fetcher },
    ctx: ExecutionContext
  ) {
    const url = new URL(request.url);

    if (url.hostname === "www.edicut.com") {
      url.hostname = "edicut.com";
      return Response.redirect(url.toString(), 308);
    }

    const isStaticAssetRequest =
      request.method === "GET" || request.method === "HEAD"
        ? IMMUTABLE_ASSET_PATH.test(url.pathname) || PUBLIC_ASSET_PATH.test(url.pathname)
        : false;

    if (isStaticAssetRequest && env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request.url, request);
      return withSecurityHeaders(withStaticCacheHeaders(assetResponse, url.pathname), request);
    }

    const response = await handleRequest({
      request,
      env,
      waitUntil: ctx.waitUntil.bind(ctx),
      passThroughOnException: "passThroughOnException" in ctx && typeof ctx.passThroughOnException === "function"
        ? ctx.passThroughOnException.bind(ctx)
        : () => {},
      data: {},
      params: {},
    });

    return withSecurityHeaders(response, request);
  },
};
