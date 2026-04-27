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

export default {
  fetch(
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
        ? url.pathname === "/_root.data" || url.pathname.startsWith("/assets/")
        : false;

    if (isStaticAssetRequest && env.ASSETS) {
      return env.ASSETS.fetch(request.url, request);
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
