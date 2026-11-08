import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderContext } from "../types";
import type { ChatAttachment } from "./chat";
import { requireCloudinaryEnv, signUpload } from "./cloudinary.server";
import {
  deleteGoogleDriveFile,
  downloadGoogleDriveFile,
  googleDriveAccessToken,
  safeGoogleDriveFileId,
} from "./google-drive-storage.server";
import { fetchWithHeadersTimeout, fetchWithTimeout } from "@edicut/shared/server-fetch";

export const CHAT_FILE_MAX_BYTES = 10 * 1024 * 1024 * 1024;
export const CHAT_FILE_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "video/mp4", "video/webm",
] as const;
const extensionForType: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "application/pdf": "pdf", "video/mp4": "mp4", "video/webm": "webm",
};
const previewable = (mime: string) => mime.startsWith("image/") || mime.startsWith("video/") || mime === "application/pdf";
const safeAttachmentName = (name: string) => Array.from(name.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, ""), character =>
  character.length === 1 && /[\uD800-\uDFFF]/.test(character) ? "\uFFFD" : character,
).join("");
const encodeAttachmentName = (name: string) => encodeURIComponent(name).replace(/[\'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

export function chatAttachmentName(file: Pick<File, "name" | "type">) {
  const extension = extensionForType[file.type] ?? "file";
  const cleanName = safeAttachmentName(file.name);
  const extensionAt = cleanName.lastIndexOf(".");
  const stem = (extensionAt > 0 ? cleanName.slice(0, extensionAt) : cleanName).trim().replace(/[. ]+$/g, "");
  const safeStem = Array.from(stem && stem !== "." && stem !== ".." ? stem : "attachment").slice(0, 180 - extension.length - 1).join("");
  return `${safeStem || "attachment"}.${extension}`;
}

export function validateChatFileMetadata(mime: string, bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > CHAT_FILE_MAX_BYTES || !(CHAT_FILE_TYPES as readonly string[]).includes(mime))
    return "Choose a JPG, PNG, WebP, GIF, PDF, MP4, or WebM up to 10 GB. All chat attachments share a 10 GB client limit.";
  return null;
}

export function validateChatFileHeader(value: Uint8Array, mime: string) {
  const ascii = (start: number, length: number) => String.fromCharCode(...value.slice(start, start + length));
  return mime === "image/jpeg" ? value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff
    : mime === "image/png" ? [...value.slice(0, 8)].join(",") === "137,80,78,71,13,10,26,10"
    : mime === "image/webp" ? ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
    : mime === "image/gif" ? ["GIF87a", "GIF89a"].includes(ascii(0, 6))
    : mime === "application/pdf" ? ascii(0, 5) === "%PDF-"
    : mime === "video/mp4" ? ascii(4, 4) === "ftyp"
    : mime === "video/webm" ? value[0] === 0x1a && value[1] === 0x45 && value[2] === 0xdf && value[3] === 0xa3
    : false;
}

export async function validateChatFile(file: File) {
  const error = validateChatFileMetadata(file.type, file.size);
  if (error) return error;
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return validateChatFileHeader(header, file.type) ? null : "This file does not match its format. Choose another file.";
}

export async function deleteChatFile(file: ChatAttachment, db: DatabaseClient, context?: LoaderContext) {
  if (file.provider === "google_drive" || file.driveFileId) {
    if (!safeGoogleDriveFileId(file.driveFileId)) throw new Error("Invalid Google Drive chat attachment ID");
    const token = await googleDriveAccessToken(db, context as LoaderContext);
    return deleteGoogleDriveFile(file.driveFileId, token);
  }
  const env = await requireCloudinaryEnv(context);
  const params = { public_id: file.publicId, type: "private", timestamp: Math.floor(Date.now() / 1000) };
  const form = new FormData(); for (const [key, value] of Object.entries(params)) form.set(key, String(value));
  form.set("api_key", env.apiKey!); form.set("signature", await signUpload(params, env.apiSecret!));
  const response = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${env.cloudName}/raw/destroy`, { method: "POST", body: form });
  if (!response.ok) throw new Error("Private chat attachment cleanup failed");
}

function attachmentHeaders(file: ChatAttachment, name: string) {
  const disposition = previewable(file.mime) ? "inline" : "attachment";
  return {
    "Content-Type": file.mime,
    "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeAttachmentName(name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; media-src 'self'; img-src 'self' data:",
    "Referrer-Policy": "no-referrer",
  };
}

export async function downloadChatFile(file: ChatAttachment, db: DatabaseClient, context?: LoaderContext, range?: string | null, signal?: AbortSignal) {
  const name = chatAttachmentName({ name: file.name, type: file.mime });
  if (file.provider === "google_drive" || file.driveFileId) {
    if (!safeGoogleDriveFileId(file.driveFileId)) throw new Response("Attachment unavailable.", { status: 404 });
    const token = await googleDriveAccessToken(db, context as LoaderContext);
    const response = await downloadGoogleDriveFile(file.driveFileId, token, range, signal);
    const headers = new Headers(attachmentHeaders(file, name));
    for (const header of ["Accept-Ranges", "Content-Range", "Content-Length"]) {
      const value = response.headers.get(header);
      if (value && /^[\x20-\x7e]+$/.test(value)) headers.set(header, value);
    }
    headers.set("Accept-Ranges", "bytes");
    return new Response(response.body, { status: response.status, headers });
  }

  const env = await requireCloudinaryEnv(context);
  const params: Record<string, string | number> = { public_id: file.publicId, type: "private", timestamp: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + 60 };
  if (!previewable(file.mime)) params.attachment = "true";
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), api_key: env.apiKey!, signature: await signUpload(params, env.apiSecret!) });
  const response = await fetchWithHeadersTimeout(`https://api.cloudinary.com/v1_1/${env.cloudName}/raw/download?${query}`, { signal });
  if (!response.ok) throw new Response("Attachment download is temporarily unavailable.", { status: 502 });
  return new Response(response.body, { headers: attachmentHeaders(file, name) });
}
