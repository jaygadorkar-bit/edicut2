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
import { shouldServeStaticAsset, shouldServeStaticPublicPage } from "./static-assets";
import { withSecurityHeaders, withStaticCacheHeaders } from "./security-headers";
import { authorizeChatSocket } from "../app/lib/chat-socket.server";
import { getCanonicalSiteRedirect } from "./site-redirects";
import { scheduleApplicationErrorCapture } from "../app/lib/application-error-log.server";
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

    const canonicalRedirect = getCanonicalSiteRedirect(request);
    if (canonicalRedirect) return canonicalRedirect;

    const isStaticAssetRequest = shouldServeStaticAsset(request.method, pathname);

    if (isStaticAssetRequest && env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request.url, request);
      return withSecurityHeaders(withStaticCacheHeaders(assetResponse, url.pathname), request, true);
    }

    if (shouldServeStaticPublicPage(request.method, pathname) && env.ASSETS) {
      const pageResponse = await env.ASSETS.fetch(request.url, request);
      if (pageResponse.ok) {
        const response = withStaticCacheHeaders(pageResponse, url.pathname);
        const headers = new Headers(response.headers);
        headers.set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=60");
        return withSecurityHeaders(new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        }), request, true);
      }
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
      if (boundedRequest.exceeded()) return withSecurityHeaders(requestTooLargeResponse(), request);
      if (error instanceof Response && error.status < 500) return withSecurityHeaders(error, request);
      const errorContext = createWebLoadContext({ env: env as Record<string, string | undefined>, ctx });
      scheduleApplicationErrorCapture(errorContext, request, error);
      return withSecurityHeaders(new Response("The service is temporarily unavailable. Try again shortly.", {
        status: 500,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
      }), request);
    }

    if (boundedRequest.exceeded()) {
      return withSecurityHeaders(requestTooLargeResponse(), request);
    }

    return withSecurityHeaders(response, request);
  },
};
