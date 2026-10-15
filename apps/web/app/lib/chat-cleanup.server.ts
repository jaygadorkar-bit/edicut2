import type { LoaderContext } from "../types";
import { chatId } from "./chat";
import { chatD1Binding, chatEnvironment } from "./chat-d1-remote.server";

/** Permanent deletion of already-trashed accounts. Run before the Neon delete
 * so an unavailable D1 leaves source IDs available for a normal retry. */
export async function removeD1ChatUsers(context: LoaderContext | undefined, ids: string[]) {
  const env = chatEnvironment(context);
  if (env?.CHAT_BACKEND !== "d1" || !ids.length) return;
  if (!ids.every(chatId)) throw new Error("Invalid chat cleanup identifiers");
  const d1 = chatD1Binding(context);
  if (!d1) throw new Error("Chat database binding unavailable");
  await d1.prepare("DELETE FROM users WHERE id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).run();
}
