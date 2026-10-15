import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import type { LoaderContext } from "../types";
import { requireChatActor } from "../lib/chat-access.server";
import { canSendChatMessage, chatId, chatMessagePayloadMatches, chatSenderName, validateChatMessage, validateSupportTicket, TICKET_STATUSES, TICKET_PRIORITIES, type TicketCategory, type TicketPriority, type TicketStatus } from "../lib/chat";
import { createChatStore, isMissingChatSchema, chatMigrationPaused } from "../lib/chat-store.server";
import { CHAT_FILE_MAX_BYTES, chatAttachmentName, deleteChatFile, downloadChatFile, uploadChatFile, validateChatFile } from "../lib/chat-files.server";
import { deferChatNotification, notifyChatActors } from "../lib/chat-realtime.server";
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
    const chat = createChatStore(db, context);
    const operation = url.searchParams.get("operation") ?? "rooms";
    const search = (url.searchParams.get("search") ?? "").trim().slice(0, 120);
    if (operation === "people") return chat.chatPeople(actor, search);
    if (operation === "unread") return chat.getChatUnreadCounts(actor);
    if (operation === "rooms" || operation === "sync") {
      const view = url.searchParams.get('view') === 'tickets' ? 'tickets' : 'projects';
      const selectedId = url.searchParams.get("roomId")?.toLowerCase();
      if (operation === "sync" && selectedId && !chatId(selectedId)) throw new Response("Choose a valid conversation.", { status: 400 });
      if (view === 'projects') await chat.ensureClientChatRooms(actor);
      const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1));
      const filter = ['open', ...Object.keys(TICKET_STATUSES)].includes(url.searchParams.get("filter") ?? "") ? url.searchParams.get("filter")! : "all";
      if (operation === "sync") return chat.getChatSnapshot(actor, {
        page, search, filter, view, roomId: selectedId || undefined,
        messageSearch: (url.searchParams.get("messageSearch") ?? "").trim().slice(0, 120),
      });
      return chat.listChatRooms(actor, page, search, filter, view);
    }
    const roomId = url.searchParams.get("roomId")?.toLowerCase(); if (!chatId(roomId)) throw new Response("Choose a conversation.", { status: 400 });
    if (operation === "attachment") {
      const messageId = url.searchParams.get("messageId")?.toLowerCase(); if (!chatId(messageId)) throw new Response("Invalid attachment", { status: 400 });
      return downloadChatFile(await chat.getChatAttachment(actor, roomId, messageId), context as LoaderContext);
    }
    if (operation !== "messages") throw new Response("Unknown chat request.", { status: 400 });
    const at = url.searchParams.get("beforeAt"), id = url.searchParams.get("beforeId")?.toLowerCase();
    if ((at || id) && (!at || !chatId(id) || !Number.isFinite(Date.parse(at)))) throw new Response("Invalid message cursor.", { status: 400 });
    return chat.listChatMessages(actor, roomId, at && id ? { at, id } : undefined, search);
  });
}
export async function action({ request, context }: ActionFunctionArgs) {
  return safely(async () => {
    if (!isSameSiteMutation(request) || request.headers.get("Origin") !== new URL(request.url).origin) throw new Response("Send changes from this site.", { status: 403 });
    if (chatMigrationPaused(context)) throw new Response("Chat is being upgraded. Please keep your draft and try again shortly.", { status: 503 });
    const url = new URL(request.url); const { db, actor } = await requireChatActor(request, context, url.searchParams.get("scope") === "admin");
    const chat = createChatStore(db, context);
    const limit = await consumeUsageLimit({ request, context, bindingName: "USER_ACTION_LIMITER", key: `chat:${actor.key}`, localLimit: 60, localPeriodSeconds: 60 });
    if (limit !== "allowed") throw new Response(limit === "limited" ? "Please wait a minute before trying again." : "Chat is temporarily unavailable.", { status: limit === "limited" ? 429 : 503 });
    const form = await readMutationForm(request, CHAT_FILE_MAX_BYTES + 32 * 1024); if (!form) throw new Response("Submit a valid message with attachments up to 5 MB.", { status: 400 });
    const intent = String(form.get("intent") ?? ""); const roomId = String(form.get("roomId") ?? "").toLowerCase();
    if (intent === 'ticket-create') {
      const subject = String(form.get('subject') ?? '').trim(), body = String(form.get('body') ?? '').trim();
      const category = String(form.get('category') ?? ''), priority = String(form.get('priority') ?? 'normal'), nonce = String(form.get('nonce') ?? '').toLowerCase();
      const invalid = validateSupportTicket(subject, category, body, priority, nonce); if (invalid) throw new Response(invalid, { status: 400 });
      const room = await chat.createSupportTicket(actor, nonce, subject, category as TicketCategory, priority as TicketPriority, body);
      await notifyChatActors(context as LoaderContext, await chat.chatRecipients(room.id)); return { room };
    }
    if (intent === "create") {
      const clientId = String(form.get("clientId") ?? "").toLowerCase(); if (!chatId(clientId)) throw new Response("Choose a client.", { status: 400 });
      const rooms = await chat.createChatRoomsForClient(actor, clientId);
      await notifyChatActors(context as LoaderContext, await chat.chatRecipients(rooms[0].id)); return { rooms };
    }
    if (!chatId(roomId)) throw new Response("Choose a conversation.", { status: 400 });
    if (intent === "send") {
      const body = String(form.get("body") ?? "").trim(), nonce = String(form.get("nonce") ?? "").toLowerCase();
      const entries = form.getAll("file");
      if (entries.length > 1) throw new Response("Choose one valid attachment file.", { status: 400 });
      const fileEntry = entries[0];
      if (typeof fileEntry === "string") throw new Response("Choose one valid attachment file.", { status: 400 });
      const file: File | null = fileEntry ?? null;
      const invalid = validateChatMessage(body, nonce, Boolean(file)); if (invalid) throw new Response(invalid, { status: 400 });
      // Text writes enforce room access and send permission atomically in the
      // store. Attachments need a preflight before uploading the file.
      const room = file ? await chat.getChatRoom(actor, roomId) : null;
      if (room && !canSendChatMessage(actor, room)) throw new Response(room.ticket?.status === 'closed' ? 'Reopen this ticket before sending a reply.' : 'Project manager is available after purchasing a subscription.', { status: 403 });
      if (file) { const invalidFile = await validateChatFile(file); if (invalidFile) throw new Response(invalidFile, { status: 400 }); }
      if (file) {
        const existing = await chat.findChatMessageByNonce(actor, roomId, nonce);
        if (existing) {
          if (!chatMessagePayloadMatches(existing, body, { name: chatAttachmentName(file), mime: file.type, bytes: file.size })) throw new Response("Message reference already used. Refresh before sending.", { status: 409 });
          return { message: existing };
        }
        const uploadLimit = await consumeUsageLimit({ request, context, bindingName: "CLOUDINARY_UPLOAD_LIMITER", key: `chat:${actor.key}`, localLimit: 2, localPeriodSeconds: 60 });
        if (uploadLimit !== "allowed") throw new Response(uploadLimit === "limited" ? "Attachments are limited to two uploads per minute." : "Attachment uploads are temporarily unavailable.", { status: uploadLimit === "limited" ? 429 : 503 });
      }
      const attachment = file ? await uploadChatFile(file, roomId, context as LoaderContext) : null;
      try {
        const message = await chat.sendChatMessage(actor, roomId, body, nonce, attachment);
        if (attachment && message.attachment?.publicId !== attachment.publicId) await deleteChatFile(attachment, context as LoaderContext).catch(() => console.warn("Unused chat attachment requires cleanup"));
        deferChatNotification(context as LoaderContext, async () => notifyChatActors(context as LoaderContext, await chat.chatRecipients(roomId)));
        return { message };
      } catch (error) {
        if (attachment && error instanceof Response && [403, 409].includes(error.status)) await deleteChatFile(attachment, context as LoaderContext).catch(() => console.warn("Unused chat attachment requires cleanup"));
        // Never delete an attachment after an uncertain commit: a retry uses the
        // same nonce and retrieves the persisted message without charging twice.
        throw error;
      }
    }
    const room = await chat.getChatRoom(actor, roomId);
    if (intent === 'ticket-update') {
      const status = String(form.get('status') ?? ''), priority = String(form.get('priority') ?? ''), expected = String(form.get('expectedUpdatedAt') ?? '');
      if (!Object.hasOwn(TICKET_STATUSES, status) || !Object.hasOwn(TICKET_PRIORITIES, priority) || !Number.isFinite(Date.parse(expected)) || new Date(expected).toISOString() !== expected) throw new Response('Choose a valid ticket status and refresh before updating.', { status: 400 });
      const updated = await chat.updateSupportTicket(actor, roomId, status as TicketStatus, priority as TicketPriority, expected);
      await notifyChatActors(context as LoaderContext, await chat.chatRecipients(roomId)); return { room: updated };
    }
    if (intent === "assign") {
      const managerId = String(form.get("managerId") ?? "").toLowerCase() || null, expected = String(form.get("expectedManagerId") ?? "").toLowerCase() || null;
      if ((managerId && !chatId(managerId)) || (expected && !chatId(expected))) throw new Response("Choose a valid manager.", { status: 400 });
      await chat.assignChatManager(actor, roomId, managerId, expected);
      await notifyChatActors(context as LoaderContext, await chat.chatRecipients(roomId, room.managerId)); return { ok: true };
    }
    if (intent === "typing") {
      if (!canSendChatMessage(actor, room)) throw new Response("Conversation unavailable", { status: 403 });
      await notifyChatActors(context as LoaderContext, (await chat.chatRecipients(roomId)).filter(key => key !== actor.key), { type: "typing", roomId, actorKey: actor.key, name: chatSenderName(actor.role, actor.name) }); return { ok: true };
    }
    const messageId = String(form.get("messageId") ?? "").toLowerCase();
    if (intent === "read") {
      if (!chatId(messageId)) throw new Response("Invalid message", { status: 400 });
      await chat.markChatRead(actor, roomId, messageId);
      await notifyChatActors(context as LoaderContext, await chat.chatRecipients(roomId)); return { ok: true };
    }
    if (intent === "edit" || intent === "delete") {
      if (!canSendChatMessage(actor, room)) throw new Response('Reopen this ticket or check your project access before changing messages.', { status: 403 });
      if (!chatId(messageId)) throw new Response("Choose your message", { status: 400 });
      const body = String(form.get("body") ?? "").trim();
      if (intent === "edit" && (!body || body.length > 4000)) throw new Response("Use 1–4,000 characters.", { status: 400 });
      const message = await chat.changeChatMessage(actor, roomId, messageId, intent === "delete" ? null : body);
      if (intent === "delete" && message.attachment) {
        try { await deleteChatFile(message.attachment, context as LoaderContext); } catch { console.warn("Deleted chat attachment requires storage cleanup"); }
      }
      await notifyChatActors(context as LoaderContext, await chat.chatRecipients(roomId)); return { message };
    }
    throw new Response("Unknown chat action.", { status: 400 });
  });
}
