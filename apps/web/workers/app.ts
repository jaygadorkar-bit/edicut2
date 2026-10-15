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
import { shouldServeStaticAsset } from "./static-assets";
import { withSecurityHeaders, withStaticCacheHeaders } from "./security-headers";
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
      return withSecurityHeaders(withStaticCacheHeaders(assetResponse, url.pathname), request, true);
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
