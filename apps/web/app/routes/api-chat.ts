import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { LoaderContext } from "../types";
import { requireChatActor } from "../lib/chat-access.server";
import { canSendChatMessage, chatId, validateChatMessage } from "../lib/chat";
import { assignChatManager, changeChatMessage, chatPeople, chatRecipients, createChatRoomsForClient, ensureClientChatRooms, findChatMessageByNonce, getChatAttachment, getChatRoom, isMissingChatSchema, listChatMessages, listChatRooms, markChatRead, sendChatMessage } from "../lib/chat.server";
import { CHAT_FILE_MAX_BYTES, deleteChatFile, downloadChatFile, uploadChatFile, validateChatFile } from "../lib/chat-files.server";
import { notifyChatActors } from "../lib/chat-realtime.server";
import { isSameSiteMutation, readMutationForm } from "../lib/mutation-request.server";
import { consumeUsageLimit } from "../lib/usage-protection.server";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export function headers() { return { "Cache-Control": "no-store" }; }
async function safely(operation: () => Promise<unknown>) {
  try { const result = await operation(); return result instanceof Response ? result : json(result); }
  catch (error) {
    if (error instanceof Response) {
      if (error.status >= 300 && error.status < 400) {
        const response = json({ error: "Your session needs refreshing. Reload this page to sign in again.", sessionExpired: true }, 401);
        const cookie = error.headers.get("Set-Cookie"); if (cookie) response.headers.set("Set-Cookie", cookie);
        return response;
      }
      return json({ error: await error.text() }, error.status);
    }
    if (isMissingChatSchema(error)) return json({ error: "Chat is waiting for database setup. Please try again later.", setupRequired: true }, 503);
    console.error("Chat request failed", error instanceof Error ? error.name : "unknown");
    return json({ error: "Chat is temporarily unavailable. Your draft is saved here; try again shortly." }, 503);
  }
}
export async function loader({ request, context }: LoaderFunctionArgs) {
  return safely(async () => {
    const url = new URL(request.url); const { db, actor } = await requireChatActor(request, context, url.searchParams.get("scope") === "admin");
    const operation = url.searchParams.get("operation") ?? "rooms";
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 120);
    if (operation === "people") return chatPeople(db, actor, search);
    if (operation === "rooms") {
      await ensureClientChatRooms(db, actor);
      const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1));
      const filter = ["manager", "support"].includes(url.searchParams.get("filter") ?? "") ? url.searchParams.get("filter")! : "all";
      return listChatRooms(db, actor, page, search, filter);
    }
    const roomId = url.searchParams.get("roomId"); if (!chatId(roomId)) throw new Response("Choose a conversation.", { status: 400 });
    if (operation === "attachment") {
      const messageId = url.searchParams.get("messageId"); if (!chatId(messageId)) throw new Response("Invalid attachment", { status: 400 });
      return downloadChatFile(await getChatAttachment(db, actor, roomId, messageId), context as LoaderContext);
    }
    if (operation !== "messages") throw new Response("Unknown chat request.", { status: 400 });
    const at = url.searchParams.get("beforeAt"), id = url.searchParams.get("beforeId");
    if ((at || id) && (!at || !chatId(id) || !Number.isFinite(Date.parse(at)))) throw new Response("Invalid message cursor.", { status: 400 });
    return listChatMessages(db, actor, roomId, at && id ? { at, id } : undefined, search);
  });
}
export async function action({ request, context }: ActionFunctionArgs) {
  return safely(async () => {
    if (!isSameSiteMutation(request)) throw new Response("Send changes from this site.", { status: 403 });
    const url = new URL(request.url); const { db, actor } = await requireChatActor(request, context, url.searchParams.get("scope") === "admin");
    const limit = await consumeUsageLimit({ request, context, bindingName: "USER_ACTION_LIMITER", key: `chat:${actor.key}`, localLimit: 60, localPeriodSeconds: 60 });
    if (limit !== "allowed") throw new Response(limit === "limited" ? "Please wait a minute before trying again." : "Chat is temporarily unavailable.", { status: limit === "limited" ? 429 : 503 });
    const form = await readMutationForm(request, CHAT_FILE_MAX_BYTES + 32 * 1024); if (!form) throw new Response("Submit a valid message with attachments up to 5 MB.", { status: 400 });
    const intent = String(form.get("intent") ?? ""); const roomId = String(form.get("roomId") ?? "");
    if (intent === "create") {
      const clientId = form.get("clientId"); if (!chatId(clientId)) throw new Response("Choose a client.", { status: 400 });
      const rooms = await createChatRoomsForClient(db, actor, clientId);
      await notifyChatActors(context as LoaderContext, await chatRecipients(db, rooms[0].id)); return { rooms };
    }
    if (!chatId(roomId)) throw new Response("Choose a conversation.", { status: 400 });
    const room = await getChatRoom(db, actor, roomId);
    if (intent === "assign") {
      const managerId = String(form.get("managerId") ?? "") || null, expected = String(form.get("expectedManagerId") ?? "") || null;
      if ((managerId && !chatId(managerId)) || (expected && !chatId(expected))) throw new Response("Choose a valid manager.", { status: 400 });
      await assignChatManager(db, actor, roomId, managerId, expected);
      await notifyChatActors(context as LoaderContext, await chatRecipients(db, roomId, room.managerId)); return { ok: true };
    }
    if (intent === "typing") {
      if (!canSendChatMessage(actor, room)) throw new Response("Conversation unavailable", { status: 403 });
      await notifyChatActors(context as LoaderContext, (await chatRecipients(db, roomId)).filter(key => key !== actor.key), { type: "typing", roomId, actorKey: actor.key, name: actor.name }); return { ok: true };
    }
    const messageId = form.get("messageId");
    if (intent === "read") {
      if (!chatId(messageId)) throw new Response("Invalid message", { status: 400 });
      await markChatRead(db, actor, roomId, messageId);
      await notifyChatActors(context as LoaderContext, await chatRecipients(db, roomId)); return { ok: true };
    }
    if (intent === "edit" || intent === "delete") {
      if (!chatId(messageId)) throw new Response("Choose your message", { status: 400 });
      const body = String(form.get("body") ?? "").trim();
      if (intent === "edit" && (!body || body.length > 4000)) throw new Response("Use 1–4,000 characters.", { status: 400 });
      const message = await changeChatMessage(db, actor, roomId, messageId, intent === "delete" ? null : body);
      if (intent === "delete" && message.attachment) {
        try { await deleteChatFile(message.attachment, context as LoaderContext); } catch { console.warn("Deleted chat attachment requires storage cleanup"); }
      }
      await notifyChatActors(context as LoaderContext, await chatRecipients(db, roomId)); return { message };
    }
    if (intent !== "send") throw new Response("Unknown chat action.", { status: 400 });
    const body = String(form.get("body") ?? "").trim(), nonce = String(form.get("nonce") ?? "");
    const entry = form.get("file"); const file = entry && typeof entry !== "string" && entry.size ? entry : null;
    const invalid = validateChatMessage(body, nonce, Boolean(file)); if (invalid) throw new Response(invalid, { status: 400 });
    if (!canSendChatMessage(actor, room)) throw new Response("Your manager has not been assigned yet. Customer support is available.", { status: 403 });
    if (file) { const invalidFile = await validateChatFile(file); if (invalidFile) throw new Response(invalidFile, { status: 400 }); }
    const existing = await findChatMessageByNonce(db, actor, roomId, nonce);
    if (existing) {
      if (existing.body !== body) throw new Response("Message reference already used. Refresh before sending.", { status: 409 });
      return { message: existing };
    }
    const attachment = file ? await uploadChatFile(file, roomId, context as LoaderContext) : null;
    try {
      const message = await sendChatMessage(db, actor, roomId, body, nonce, attachment);
      if (attachment && message.attachment?.publicId !== attachment.publicId) await deleteChatFile(attachment, context as LoaderContext).catch(() => console.warn("Unused chat attachment requires cleanup"));
      await notifyChatActors(context as LoaderContext, await chatRecipients(db, roomId)); return { message };
    } catch (error) {
      if (attachment && error instanceof Response && [403, 409].includes(error.status)) await deleteChatFile(attachment, context as LoaderContext).catch(() => console.warn("Unused chat attachment requires cleanup"));
      // Never delete an attachment after an uncertain commit: a retry uses the
      // same nonce and retrieves the persisted message without charging twice.
      throw error;
    }
  });
}
