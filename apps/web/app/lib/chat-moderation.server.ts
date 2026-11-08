import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderContext } from "../types";
import type { ChatAttachment } from "./chat";
import { deleteChatFile } from "./chat-files.server";
import { markChatAttachmentDeleted, queueChatAttachmentCleanup } from "./chat-attachment-uploads.server";

/** Call only after the authorized chat mutation has made the file inaccessible. */
export async function cleanupRemovedChatAttachment(attachment: ChatAttachment | null, db: DatabaseClient, context: LoaderContext) {
  if (!attachment) return false;
  try { await queueChatAttachmentCleanup(db, attachment); }
  catch { console.warn("Chat attachment cleanup could not be queued"); }
  try {
    await deleteChatFile(attachment, db, context);
    await markChatAttachmentDeleted(db, attachment);
    return false;
  } catch {
    console.warn("Removed chat attachment requires storage cleanup");
    return true;
  }
}
