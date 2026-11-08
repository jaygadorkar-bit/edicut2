import type { LoaderContext } from "../types";
import type { DatabaseClient } from "@edicut/db/client";
import { sql } from "drizzle-orm";
import { chatId } from "./chat";
import { chatRows, isMissingChatSchema } from "./chat.server";
export type ChatEvent = { type: "refresh" } | { type: "typing"; roomId: string; actorKey: string; name: string };
declare global {
  var __edicutChatNotify: ((keys: string[], event: ChatEvent) => void) | undefined;
}

/** Capture before hard deletion, when room/client/manager links still exist. */
export async function chatAccessRecipients(db: DatabaseClient, userIds: string[] = [], subscriptionId?: string, _context?: LoaderContext) {
  if (!userIds.every(chatId) || subscriptionId && !chatId(subscriptionId)) return [];
  // Assignments live in Supabase for both chat backends. A pre-payment client
  // may have a manager before there is any D1 room to use as an access mirror.
  const users = userIds.length ? sql.join(userIds.map(id => sql`${id}::uuid`), sql`,`) : sql`NULL::uuid`;
  const rows = chatRows<{ key: string }>(await db.execute(sql`WITH affected AS (
    SELECT id FROM users WHERE id IN (${users})
    UNION SELECT client_id FROM client_project_managers WHERE manager_id IN (${users})
    UNION SELECT owner_id FROM customer_subscriptions WHERE id = ${subscriptionId ?? null}::uuid
  ) SELECT 'user:' || id AS key FROM affected
    UNION SELECT 'admin:' || id FROM admin_users WHERE active AND role = 'admin'
    UNION SELECT 'user:' || id FROM users WHERE active AND deleted_at IS NULL AND role = 'customer_support'
    UNION SELECT 'user:' || manager_id FROM client_project_managers WHERE client_id IN (SELECT id FROM affected) AND manager_id IS NOT NULL`));
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
