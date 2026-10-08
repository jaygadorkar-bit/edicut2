import type { LoaderContext } from "../types";
export type ChatEvent = { type: "refresh" } | { type: "typing"; roomId: string; actorKey: string; name: string };
declare global {
  var __edicutChatNotify: ((keys: string[], event: ChatEvent) => void) | undefined;
}
export async function notifyChatActors(context: LoaderContext | undefined, keys: string[], event: ChatEvent = { type: "refresh" }) {
  const env = context?.cf?.env as Record<string, unknown> | undefined;
  const namespace = env?.CHAT_SOCKET_HUB as DurableObjectNamespace | undefined;
  if (namespace) {
    const results = await Promise.allSettled([...new Set(keys)].map(key => namespace.get(namespace.idFromName(key)).fetch(
      new Request("https://chat.internal/notify", { method: "POST", body: JSON.stringify(event) }),
    )));
    if (results.some(r => r.status === "rejected" || !r.value.ok)) console.warn("Chat notification delivery interrupted; clients will resync.");
  } else {
    globalThis.__edicutChatNotify?.(keys, event);
  }
}
