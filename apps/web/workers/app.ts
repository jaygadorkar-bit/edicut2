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
      return withStaticCacheHeaders(assetResponse, url.pathname);
    }

    return handleRequest({
      request,
      env,
      waitUntil: ctx.waitUntil.bind(ctx),
      passThroughOnException: "passThroughOnException" in ctx && typeof ctx.passThroughOnException === "function"
        ? ctx.passThroughOnException.bind(ctx)
        : () => {},
      data: {},
      params: {},
    });
  },
};
