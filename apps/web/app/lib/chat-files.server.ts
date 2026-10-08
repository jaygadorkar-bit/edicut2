import type { LoaderContext } from "../types";
import type { ChatAttachment } from "./chat";
import { requireCloudinaryEnv, signUpload } from "./cloudinary.server";
import { fetchWithTimeout, UPLOAD_FETCH_TIMEOUT_MS } from "@edicut/shared/server-fetch";
export const CHAT_FILE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export async function validateChatFile(file: File) {
  if (!file.size || file.size > CHAT_FILE_MAX_BYTES || !CHAT_FILE_TYPES.includes(file.type)) return "Choose a JPG, PNG, WebP, or PDF up to 5 MB.";
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start: number, length: number) => String.fromCharCode(...b.slice(start, start + length));
  const valid = file.type === "image/jpeg" ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
    : file.type === "image/png" ? [...b.slice(0, 8)].join(",") === "137,80,78,71,13,10,26,10"
    : file.type === "image/webp" ? ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP" : ascii(0, 5) === "%PDF-";
  return valid ? null : "This file does not match its format. Choose another file.";
}
export async function uploadChatFile(file: File, roomId: string, context?: LoaderContext): Promise<ChatAttachment> {
  const error = await validateChatFile(file); if (error) throw new Response(error, { status: 400 });
  const env = await requireCloudinaryEnv(context);
  const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" })[file.type];
  const publicId = `edicut/chat/${roomId}/${crypto.randomUUID()}.${ext}`;
  const params = { public_id: publicId, type: "private", timestamp: Math.floor(Date.now() / 1000), overwrite: "false" };
  const form = new FormData(); form.set("file", file); form.set("api_key", env.apiKey!);
  for (const [key, value] of Object.entries(params)) form.set(key, String(value));
  form.set("signature", await signUpload(params, env.apiSecret!));
  const response = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${env.cloudName}/raw/upload`, { method: "POST", body: form }, UPLOAD_FETCH_TIMEOUT_MS);
  const result = await response.json() as { public_id?: string; bytes?: number; type?: string; resource_type?: string };
  if (!response.ok || result.public_id !== publicId || result.type !== "private" || result.resource_type !== "raw") throw new Response("Your attachment could not be uploaded. Try again.", { status: 502 });
  return { publicId, name: file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 180) || `attachment.${ext}`, mime: file.type, bytes: file.size };
}
export async function deleteChatFile(file: ChatAttachment, context?: LoaderContext) {
  const env = await requireCloudinaryEnv(context);
  const params = { public_id: file.publicId, type: "private", timestamp: Math.floor(Date.now() / 1000) };
  const form = new FormData(); for (const [key, value] of Object.entries(params)) form.set(key, String(value));
  form.set("api_key", env.apiKey!); form.set("signature", await signUpload(params, env.apiSecret!));
  const response = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${env.cloudName}/raw/destroy`, { method: "POST", body: form });
  if (!response.ok) throw new Error("Private chat attachment cleanup failed");
}
export async function downloadChatFile(file: ChatAttachment, context?: LoaderContext) {
  const env = await requireCloudinaryEnv(context);
  const params = { public_id: file.publicId, type: "private", timestamp: Math.floor(Date.now() / 1000), expires_at: Math.floor(Date.now() / 1000) + 60, attachment: "true" };
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k,v]) => [k, String(v)])), api_key: env.apiKey!, signature: await signUpload(params, env.apiSecret!) });
  const response = await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${env.cloudName}/raw/download?${query}`);
  if (!response.ok) throw new Response("Attachment download is temporarily unavailable.", { status: 502 });
  return new Response(response.body, { headers: { "Content-Type": file.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" } });
}
