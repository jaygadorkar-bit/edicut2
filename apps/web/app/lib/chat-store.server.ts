import type { DatabaseClient } from "@edicut/db/client";
import * as postgres from "./chat.server";
import { createD1ChatStore } from "./chat-d1.server";
import { loadChatAuthority } from "./chat-authority.server";
import { chatD1Binding, chatEnvironment } from "./chat-d1-remote.server";

export { isMissingChatSchema } from "./chat.server";

/** PostgreSQL contract retained for the explicit, reversible backend boundary. */
function createPostgresChatStore(db: DatabaseClient) {
  return {
    ensureClientChatRooms: postgres.ensureClientChatRooms.bind(null, db),
    listChatRooms: postgres.listChatRooms.bind(null, db),
    getChatRoom: postgres.getChatRoom.bind(null, db),
    getChatUnreadCounts: postgres.getChatUnreadCounts.bind(null, db),
    getChatSnapshot: postgres.getChatSnapshot.bind(null, db),
    listChatMessages: postgres.listChatMessages.bind(null, db),
    findChatMessageByNonce: postgres.findChatMessageByNonce.bind(null, db),
    sendChatMessage: postgres.sendChatMessage.bind(null, db),
    changeChatMessage: postgres.changeChatMessage.bind(null, db),
    getChatAttachment: postgres.getChatAttachment.bind(null, db),
    markChatRead: postgres.markChatRead.bind(null, db),
    chatPeople: postgres.chatPeople.bind(null, db),
    createChatRoomsForClient: postgres.createChatRoomsForClient.bind(null, db),
    assignChatManager: postgres.assignChatManager.bind(null, db),
    createSupportTicket: postgres.createSupportTicket.bind(null, db),
    updateSupportTicket: postgres.updateSupportTicket.bind(null, db),
    chatRecipients: postgres.chatRecipients.bind(null, db),
  };
}
export type ChatStore = ReturnType<typeof createPostgresChatStore>;

export function chatMigrationPaused(context?: unknown) {
  return chatEnvironment(context).CHAT_MAINTENANCE === "true";
}

export function createChatStore(db: DatabaseClient, context?: unknown): ChatStore {
  const env = chatEnvironment(context);
  const backend = env?.CHAT_BACKEND ?? "postgres";
  if (backend !== "postgres" && backend !== "d1") throw new Response("Chat storage configuration is unavailable.", { status: 503 });
  const binding = backend === "d1" ? chatD1Binding(context) : undefined;
  if (backend === "d1" && !binding) throw new Response("Chat database binding is unavailable.", { status: 503 });
  const store = binding ? createD1ChatStore(binding, actor => loadChatAuthority(db, actor)) : createPostgresChatStore(db);
  if (chatMigrationPaused(context)) return { ...store, ensureClientChatRooms: async () => {} };
  return store;
}
