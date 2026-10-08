import type { LoaderContext } from "../types";
import { requireChatActor } from "./chat-access.server";
import { consumeUsageLimit } from "./usage-protection.server";
export async function authorizeChatSocket(request: Request, context?: LoaderContext) {
  const url = new URL(request.url);
  if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") throw new Response("WebSocket upgrade required.", { status: 426 });
  if (request.headers.get("Origin") !== url.origin) throw new Response("Invalid socket origin.", { status: 403 });
  const { actor } = await requireChatActor(request, context, url.searchParams.get("scope") === "admin");
  const limit = await consumeUsageLimit({ context, request, bindingName: "USER_ACTION_LIMITER", key: `chat-connect:${actor.key}`, localLimit: 20, localPeriodSeconds: 60 });
  if (limit !== "allowed") throw new Response("Too many chat connections.", { status: limit === "limited" ? 429 : 503 });
  return actor;
}
