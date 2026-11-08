import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderContext } from "../types";
import type { ChatActor, ChatAttachment, ChatRoom } from "./chat";
import type { ChatStore } from "./chat-store.server";
import { chatAttachmentName, validateChatFileHeader, validateChatFileMetadata } from "./chat-files.server";
import {
  beginGoogleDriveUpload,
  decryptGoogleDriveSecret,
  deleteGoogleDriveFile,
  encryptGoogleDriveSecret,
  googleDriveAccessToken,
  googleDriveUploadStatusRange,
  safeGoogleDriveFileId,
  sendGoogleDriveUpload,
  verifyGoogleDriveFile,
} from "./google-drive-storage.server";
import { chatRows } from "./chat.server";

export const CHAT_ATTACHMENT_QUOTA_BYTES = 10 * 1024 * 1024 * 1024;
export const CHAT_ATTACHMENT_CHUNK_BYTES = 8 * 1024 * 1024;

type UploadStatus = "starting" | "uploading" | "uploaded" | "sending" | "saved" | "failed" | "deleted";
type ChatUpload = {
  id: string;
  clientId: string;
  roomId: string;
  actorKey: string;
  name: string;
  mime: string;
  bytes: number;
  sessionUri: string | null;
  driveFileId: string | null;
  receivedBytes: number;
  status: UploadStatus;
  messageId: string | null;
  clientNonce: string | null;
  leaseUntil: string | null;
  expiresAt: string;
};
const uploadColumns = sql`id,client_id AS "clientId",room_id AS "roomId",actor_key AS "actorKey",name,mime,bytes::double precision AS bytes,session_uri AS "sessionUri",drive_file_id AS "driveFileId",received_bytes::double precision AS "receivedBytes",status,message_id AS "messageId",client_nonce AS "clientNonce",lease_until AS "leaseUntil",expires_at AS "expiresAt"`;
const uploadRows = <T>(result: unknown) => chatRows<T>(result);

function validUploadId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

async function findUpload(db: DatabaseClient, actor: ChatActor, roomId: string, id: string) {
  if (!validUploadId(id)) throw new Response("Upload not found.", { status: 404 });
  const row = uploadRows<ChatUpload>(await db.execute(sql`SELECT ${uploadColumns} FROM chat_attachment_uploads
    WHERE id=${id}::uuid AND room_id=${roomId}::uuid AND actor_key=${actor.key}`))[0];
  if (!row) throw new Response("Upload not found.", { status: 404 });
  return row;
}

async function cleanupExpiredReservations(db: DatabaseClient, context: LoaderContext, chat: ChatStore, clientId: string) {
  const expired = uploadRows<Pick<ChatUpload, "id" | "roomId" | "actorKey" | "clientNonce" | "driveFileId" | "status">>(await db.execute(sql`SELECT id,room_id AS "roomId",actor_key AS "actorKey",client_nonce AS "clientNonce",drive_file_id AS "driveFileId",status
    FROM chat_attachment_uploads WHERE client_id=${clientId}::uuid AND expires_at<=now() AND status IN ('starting','uploading','uploaded','sending') AND message_id IS NULL LIMIT 50`));
  if (!expired.length) return;
  let token: string | null = null;
  for (const row of expired) {
    if (row.status === "sending" && row.clientNonce) {
      let message: Awaited<ReturnType<ChatStore["findChatMessageForUploadCleanup"]>>;
      try { message = await chat.findChatMessageForUploadCleanup(row.roomId, row.actorKey, row.clientNonce); }
      catch { continue; }
      if (message && !message.deletedAt && message.attachment?.driveFileId === row.driveFileId) {
        await db.execute(sql`UPDATE chat_attachment_uploads SET status='saved',message_id=${message.id}::uuid,session_uri=NULL,lease_until=NULL WHERE id=${row.id}::uuid AND status='sending' AND message_id IS NULL`);
        continue;
      }
    }
    if (row.driveFileId && safeGoogleDriveFileId(row.driveFileId)) {
      try {
        token ??= await googleDriveAccessToken(db, context);
        await deleteGoogleDriveFile(row.driveFileId, token);
        await db.execute(sql`UPDATE chat_attachment_uploads SET status='deleted',session_uri=NULL,drive_file_id=NULL,lease_until=NULL WHERE id=${row.id}::uuid AND status IN ('uploaded','sending') AND message_id IS NULL`);
      } catch {
        // Keep completed files charged until Drive confirms deletion.
      }
    } else {
      await db.execute(sql`UPDATE chat_attachment_uploads SET status='failed',session_uri=NULL,lease_until=NULL WHERE id=${row.id}::uuid AND status IN ('starting','uploading') AND expires_at<=now() AND message_id IS NULL`);
    }
  }
}

function existingUploadResponse(upload: ChatUpload) {
  if (upload.status === "failed" || upload.status === "deleted") throw new Response("This upload expired or could not start. Remove it and attach the file again.", { status: 410 });
  if (upload.status !== "saved" && Date.parse(upload.expiresAt) <= Date.now()) throw new Response("This upload expired. Remove it and attach the file again.", { status: 410 });
  return { uploadId: upload.id, offset: upload.status === "uploaded" || upload.status === "sending" || upload.status === "saved" ? upload.bytes : upload.receivedBytes, status: upload.status };
}

export async function startChatAttachmentUpload(args: {
  db: DatabaseClient; context: LoaderContext; chat: ChatStore; actor: ChatActor; room: ChatRoom;
  uploadId: string; name: string; mime: string; bytes: number;
}) {
  const { db, context, chat, actor, room } = args;
  if (!validUploadId(args.uploadId)) throw new Response("Refresh the chat and attach the file again.", { status: 400 });
  const invalid = validateChatFileMetadata(args.mime, args.bytes);
  if (invalid) throw new Response(invalid, { status: 400 });
  const name = chatAttachmentName({ name: args.name, type: args.mime });
  await cleanupExpiredReservations(db, context, chat, room.clientId);

  const legacyBytes = await chat.getClientLegacyChatAttachmentBytes(room.clientId);
  const reserved = await db.transaction(async tx => {
    const clientRows = uploadRows<{ id: string }>(await tx.execute(sql`SELECT id FROM users WHERE id=${room.clientId}::uuid AND active AND deleted_at IS NULL FOR UPDATE`));
    if (!clientRows.length) throw new Response("This client account is unavailable.", { status: 403 });
    const existing = uploadRows<ChatUpload>(await tx.execute(sql`SELECT ${uploadColumns} FROM chat_attachment_uploads WHERE id=${args.uploadId}::uuid`))[0];
    if (existing) {
      if (existing.actorKey !== actor.key || existing.roomId !== room.id || existing.clientId !== room.clientId || existing.name !== name || existing.mime !== args.mime || existing.bytes !== args.bytes)
        throw new Response("This upload ID belongs to a different file. Remove it and attach the file again.", { status: 409 });
      return { existing };
    }
    const active = uploadRows<{ bytes: string | number }>(await tx.execute(sql`SELECT COALESCE(sum(bytes),0)::text AS bytes FROM chat_attachment_uploads
      WHERE client_id=${room.clientId}::uuid AND (status IN ('saved','uploaded','sending') OR (status IN ('starting','uploading') AND expires_at>now()))`))[0];
    const driveBytes = Number(active?.bytes ?? 0);
    const used = legacyBytes + (Number.isSafeInteger(driveBytes) ? driveBytes : Number.MAX_SAFE_INTEGER);
    if (used + args.bytes > CHAT_ATTACHMENT_QUOTA_BYTES) throw new Response("This file would exceed the client’s 10 GB total chat storage limit. Delete an older attachment or choose a smaller file.", { status: 413 });
    await tx.execute(sql`INSERT INTO chat_attachment_uploads(id,client_id,room_id,actor_key,name,mime,bytes,status)
      VALUES(${args.uploadId}::uuid,${room.clientId}::uuid,${room.id}::uuid,${actor.key},${name},${args.mime},${args.bytes},'starting')`);
    return { existing: null as ChatUpload | null };
  });
  if (reserved.existing) return existingUploadResponse(reserved.existing);

  try {
    const token = await googleDriveAccessToken(db, context);
    const sessionUri = await beginGoogleDriveUpload(token, args.bytes, args.mime, name, `Private EdiCut chat attachment for client ${room.clientId}.`);
    const encrypted = await encryptGoogleDriveSecret(sessionUri, context);
    const saved = uploadRows(await db.execute(sql`UPDATE chat_attachment_uploads SET session_uri=${encrypted},status='uploading'
      WHERE id=${args.uploadId}::uuid AND actor_key=${actor.key} AND room_id=${room.id}::uuid AND status='starting' RETURNING id`));
    if (!saved.length) throw new Response("The upload expired before it could start. Attach the file again.", { status: 409 });
    return { uploadId: args.uploadId, offset: 0, status: "uploading" as const };
  } catch (error) {
    await db.execute(sql`UPDATE chat_attachment_uploads SET status='failed',session_uri=NULL WHERE id=${args.uploadId}::uuid AND actor_key=${actor.key} AND status='starting'`);
    throw error;
  }
}

async function claimUpload(db: DatabaseClient, actor: ChatActor, roomId: string, id: string) {
  const saved = uploadRows(await db.execute(sql`UPDATE chat_attachment_uploads SET lease_until=now()+interval '180 seconds'
    WHERE id=${id}::uuid AND room_id=${roomId}::uuid AND actor_key=${actor.key} AND status='uploading' AND expires_at>now()
      AND (lease_until IS NULL OR lease_until<now()) RETURNING id`));
  if (!saved.length) throw new Response("This upload is already transferring or has expired. Wait briefly and retry.", { status: 409 });
}
async function releaseUpload(db: DatabaseClient, actor: ChatActor, id: string) {
  await db.execute(sql`UPDATE chat_attachment_uploads SET lease_until=NULL WHERE id=${id}::uuid AND actor_key=${actor.key}`);
}

function offsetFromRange(value: string | null, previous: number, bytes: number) {
  if (value && !/^bytes=0-\d+$/.test(value)) throw new Response("Google Drive returned an invalid upload position.", { status: 502 });
  const offset = value ? Number(value.slice(8)) + 1 : 0;
  if (!Number.isSafeInteger(offset) || offset < previous || offset > bytes) throw new Response("Google Drive could not confirm this upload’s progress.", { status: 502 });
  return offset;
}

async function saveDriveProgress(db: DatabaseClient, actor: ChatActor, roomId: string, session: ChatUpload, response: Response) {
  let offset = session.receivedBytes, driveFileId = session.driveFileId;
  if (response.status === 308) offset = offsetFromRange(response.headers.get("Range"), session.receivedBytes, session.bytes);
  else if (response.ok) {
    const file = await response.json() as { id?: string; mimeType?: string; size?: string };
    if (!safeGoogleDriveFileId(file.id) || (file.mimeType && file.mimeType !== session.mime) || (file.size && Number(file.size) !== session.bytes))
      throw new Response("Google Drive could not confirm this attachment.", { status: 502 });
    driveFileId = file.id;
    offset = session.bytes;
  } else throw new Response(response.status === 404 ? "This Google Drive upload session expired. Attach the file again." : "Google Drive could not receive this part of the attachment. Retry to resume.", { status: 502 });
  const saved = uploadRows(await db.execute(sql`UPDATE chat_attachment_uploads SET received_bytes=${offset},drive_file_id=${driveFileId},status=${driveFileId ? "uploaded" : "uploading"}
    WHERE id=${session.id}::uuid AND room_id=${roomId}::uuid AND actor_key=${actor.key} AND status='uploading' AND expires_at>now() RETURNING id`));
  if (!saved.length) throw new Response("The upload expired before Drive confirmed it.", { status: 409 });
  return { uploadId: session.id, offset, status: driveFileId ? "uploaded" as const : "uploading" as const };
}

async function reconcileUpload(db: DatabaseClient, context: LoaderContext, actor: ChatActor, roomId: string, session: ChatUpload) {
  if (session.status === "uploaded" || session.status === "sending" || session.status === "saved") return { uploadId: session.id, offset: session.bytes, status: session.status };
  if (session.status !== "uploading" || !session.sessionUri) throw new Response("The upload session is not ready. Attach the file again.", { status: 409 });
  await claimUpload(db, actor, roomId, session.id);
  try {
    const token = await googleDriveAccessToken(db, context);
    const response = await sendGoogleDriveUpload(await decryptGoogleDriveSecret(session.sessionUri, context), token, googleDriveUploadStatusRange(session.bytes), null, session.mime);
    return await saveDriveProgress(db, actor, roomId, session, response);
  } finally { await releaseUpload(db, actor, session.id); }
}

export async function reconcileChatAttachmentUpload(db: DatabaseClient, context: LoaderContext, actor: ChatActor, roomId: string, uploadId: string) {
  const session = await findUpload(db, actor, roomId, uploadId);
  if (session.status !== "saved" && Date.parse(session.expiresAt) <= Date.now()) throw new Response("This upload expired. Attach the file again.", { status: 410 });
  return reconcileUpload(db, context, actor, roomId, session);
}

async function readBoundedChunk(request: Request, maximum: number) {
  if (!request.body) throw new Response("Send a file part to continue the upload.", { status: 400 });
  const reader = request.body.getReader(), parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) { await reader.cancel(); throw new Response("This file part exceeds its expected size.", { status: 413 }); }
      parts.push(part.value);
    }
  } finally { reader.releaseLock(); }
  if (size !== maximum) throw new Response("This file part was incomplete. Retry the upload.", { status: 400 });
  const body = new Uint8Array(size);
  let cursor = 0;
  for (const part of parts) { body.set(part, cursor); cursor += part.byteLength; }
  return body;
}

export async function receiveChatAttachmentChunk(args: {
  request: Request; db: DatabaseClient; context: LoaderContext; actor: ChatActor; roomId: string; uploadId: string;
}) {
  const { request, db, context, actor, roomId, uploadId } = args;
  if (!validUploadId(uploadId)) throw new Response("Upload not found.", { status: 404 });
  if (request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/octet-stream") throw new Response("Send a file part to continue the upload.", { status: 400 });
  const offsetHeader = request.headers.get("X-Chat-Upload-Offset") ?? "";
  if (!/^\d+$/.test(offsetHeader) || !Number.isSafeInteger(Number(offsetHeader))) throw new Response("Invalid upload position.", { status: 400 });
  const offset = Number(offsetHeader);
  const session = await findUpload(db, actor, roomId, uploadId);
  if (!session.sessionUri || session.status !== "uploading") throw new Response("The upload session is not ready.", { status: 409 });
  if (offset !== session.receivedBytes) throw new Response("Upload progress changed. Retry to resume from the received position.", { status: 409 });
  const maximum = Math.min(CHAT_ATTACHMENT_CHUNK_BYTES, session.bytes - offset);
  if (maximum < 1) return { uploadId, offset: session.bytes, status: "uploaded" as const };
  const body = await readBoundedChunk(request, maximum);
  if (offset === 0 && !validateChatFileHeader(body, session.mime)) throw new Response("This file does not match its format. Choose another file.", { status: 400 });
  await claimUpload(db, actor, roomId, uploadId);
  try {
    const token = await googleDriveAccessToken(db, context);
    const response = await sendGoogleDriveUpload(await decryptGoogleDriveSecret(session.sessionUri, context), token, `bytes ${offset}-${offset + body.byteLength - 1}/${session.bytes}`, body.buffer, session.mime);
    return await saveDriveProgress(db, actor, roomId, session, response);
  } finally { await releaseUpload(db, actor, uploadId); }
}

export async function finalizeChatAttachmentUpload(db: DatabaseClient, context: LoaderContext, actor: ChatActor, roomId: string, uploadId: string) {
  const session = await findUpload(db, actor, roomId, uploadId);
  if (session.status !== "saved" && Date.parse(session.expiresAt) <= Date.now()) throw new Response("This upload expired. Attach the file again.", { status: 410 });
  const current = session.status === "uploading" ? await reconcileUpload(db, context, actor, roomId, session) : { offset: session.receivedBytes, status: session.status };
  if (current.status !== "uploaded" && current.status !== "sending" && current.status !== "saved" || current.offset !== session.bytes) throw new Response("The file is still uploading. Retry to resume from the received part.", { status: 409 });
  const refreshed = await findUpload(db, actor, roomId, uploadId);
  if (!safeGoogleDriveFileId(refreshed.driveFileId)) throw new Response("Google Drive could not confirm this attachment.", { status: 502 });
  const token = await googleDriveAccessToken(db, context);
  await verifyGoogleDriveFile(refreshed.driveFileId, refreshed.bytes, refreshed.mime, token);
  return {
    upload: refreshed,
    attachment: {
      publicId: `google-drive:${refreshed.driveFileId}`,
      provider: "google_drive" as const,
      driveFileId: refreshed.driveFileId,
      name: refreshed.name,
      mime: refreshed.mime,
      bytes: refreshed.bytes,
    } satisfies ChatAttachment,
  };
}

export async function claimChatAttachmentForSend(db: DatabaseClient, actor: ChatActor, roomId: string, uploadId: string, nonce: string) {
  if (!validUploadId(nonce)) throw new Response("Refresh the chat before sending this attachment.", { status: 400 });
  const claimed = uploadRows(await db.execute(sql`UPDATE chat_attachment_uploads SET status='sending',client_nonce=COALESCE(client_nonce,${nonce}::uuid)
    WHERE id=${uploadId}::uuid AND room_id=${roomId}::uuid AND actor_key=${actor.key} AND status IN ('uploaded','sending')
      AND received_bytes=bytes AND drive_file_id IS NOT NULL AND (client_nonce IS NULL OR client_nonce=${nonce}::uuid) RETURNING id`));
  if (!claimed.length) throw new Response("This upload is already attached to a message or belongs to a different send. Attach the file again to start a new message.", { status: 409 });
}

export async function markChatAttachmentSaved(db: DatabaseClient, actor: ChatActor, uploadId: string, nonce: string, messageId: string) {
  const saved = uploadRows(await db.execute(sql`UPDATE chat_attachment_uploads SET status='saved',message_id=${messageId}::uuid,session_uri=NULL,lease_until=NULL
    WHERE id=${uploadId}::uuid AND actor_key=${actor.key} AND client_nonce=${nonce}::uuid AND status IN ('sending','saved') RETURNING id`));
  if (!saved.length) throw new Response("The message was sent, but its upload state could not be saved. Retry the same message.", { status: 503 });
}

/** Reuse the bounded expired-upload cleanup queue; quota stays charged until Drive confirms deletion. */
export async function queueChatAttachmentCleanup(db: DatabaseClient, attachment: ChatAttachment) {
  if (!attachment.driveFileId) return;
  await db.execute(sql`UPDATE chat_attachment_uploads SET status='uploaded',message_id=NULL,expires_at=now(),session_uri=NULL,lease_until=NULL
    WHERE drive_file_id=${attachment.driveFileId} AND status IN ('uploaded','sending','saved')`);
}

export async function markChatAttachmentDeleted(db: DatabaseClient, attachment: ChatAttachment) {
  if (!attachment.driveFileId) return;
  await db.execute(sql`UPDATE chat_attachment_uploads SET status='deleted',session_uri=NULL,drive_file_id=NULL,lease_until=NULL
    WHERE drive_file_id=${attachment.driveFileId} AND status IN ('uploaded','sending','saved')`);
}

