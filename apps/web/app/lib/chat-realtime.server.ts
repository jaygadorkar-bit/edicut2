import type { LoaderContext } from "../types";
import type { DatabaseClient } from "@edicut/db/client";
import { sql } from "drizzle-orm";
import { chatId } from "./chat";
import { chatRows, isMissingChatSchema } from "./chat.server";
import { chatD1Binding, chatEnvironment } from "./chat-d1-remote.server";
export type ChatEvent = { type: "refresh" } | { type: "typing"; roomId: string; actorKey: string; name: string };
declare global {
  var __edicutChatNotify: ((keys: string[], event: ChatEvent) => void) | undefined;
}

/** Capture before hard deletion, when room/client/manager links still exist. */
export async function chatAccessRecipients(db: DatabaseClient, userIds: string[] = [], subscriptionId?: string, context?: LoaderContext) {
  if (!userIds.every(chatId) || subscriptionId && !chatId(subscriptionId)) return [];
  const env = chatEnvironment(context);
  if (env?.CHAT_BACKEND === "d1") {
    const d1 = chatD1Binding(context);
    if (!d1) throw new Error("Chat database binding unavailable");
    const source = chatRows<{ key: string }>(await db.execute(sql`SELECT 'user:' || owner_id AS key FROM customer_subscriptions WHERE id = ${subscriptionId ?? null}::uuid
      UNION SELECT 'admin:' || id FROM admin_users WHERE active AND role = 'admin'
      UNION SELECT 'user:' || id FROM users WHERE active AND deleted_at IS NULL AND role = 'customer_support'`));
    const affected = [...userIds, ...source.filter(row => row.key.startsWith("user:")).map(row => row.key.slice(5))];
    const linked = await d1.prepare(`WITH affected AS (SELECT value AS id FROM json_each(?))
      SELECT 'user:'||client_id AS key FROM chat_rooms WHERE manager_id IN (SELECT id FROM affected)
      UNION SELECT 'user:'||manager_id FROM chat_rooms WHERE client_id IN (SELECT id FROM affected) AND manager_id IS NOT NULL`).bind(JSON.stringify(affected)).all<{ key: string }>();
    return [...new Set([...source.map(row => row.key), ...linked.results.map(row => row.key), ...userIds.map(id => `user:${id}`)])];
  }
  const users = userIds.length ? sql.join(userIds.map(id => sql`${id}::uuid`), sql`,`) : sql`NULL::uuid`;
  const rows = chatRows<{ key: string }>(await db.execute(sql`WITH affected AS (
    SELECT id FROM users WHERE id IN (${users})
    UNION SELECT client_id FROM chat_rooms WHERE manager_id IN (${users})
    UNION SELECT owner_id FROM customer_subscriptions WHERE id = ${subscriptionId ?? null}::uuid
  ) SELECT 'user:' || id AS key FROM affected
    UNION SELECT 'admin:' || id FROM admin_users WHERE active AND role = 'admin'
    UNION SELECT 'user:' || id FROM users WHERE active AND deleted_at IS NULL AND role = 'customer_support'
    UNION SELECT 'user:' || manager_id FROM chat_rooms WHERE client_id IN (SELECT id FROM affected) AND manager_id IS NOT NULL`));
  return [...new Set([...rows.map(row => row.key), ...userIds.map(id => `user:${id}`)])];
}

/** Access changes outside chat must invalidate live views too. Delivery failures
 * leave saved account/payment changes intact; the safety resync recovers. */
export async function notifyChatAccessChange(db: DatabaseClient, context: LoaderContext | undefined, options: { userIds?: string[]; subscriptionId?: string; recipientKeys?: string[] }) {
  try {
    const keys = options.recipientKeys ?? await chatAccessRecipients(db, options.userIds, options.subscriptionId, context);
    await notifyChatActors(context, keys);
  } catch (error) {
    if (!isMissingChatSchema(error)) console.warn("Chat access notification interrupted; clients will resync.");
  }
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

/** Keep message delivery on the response path; socket refreshes can run after it. */
export function deferChatNotification(context: LoaderContext | undefined, send: () => Promise<void>) {
  const delivery = Promise.resolve().then(() => send()).catch(() => {
    console.warn("Chat notification interrupted; connected clients will resync.");
  });
  const executionContext = context?.cf?.ctx;
  if (executionContext?.waitUntil) executionContext.waitUntil(delivery);
}
