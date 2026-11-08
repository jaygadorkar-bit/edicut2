import { createCookie, redirect } from "react-router";
import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderContext } from "../types";
import { fetchWithHeadersTimeout, fetchWithTimeout, UPLOAD_FETCH_TIMEOUT_MS } from "@edicut/shared/server-fetch";
import { isWorkspaceRecordId } from "./workspace";
import { youtubeOAuthConfig } from "./youtube-storage.server";

const CALLBACK = "/api/auth/callback/drive";
const SETTINGS = "/site/node-logmin/video-storage";
export const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const GOOGLE_DRIVE_REVIEW_MAX_BYTES = 10 * 1024 * 1024 * 1024;

const rows = <T>(result: unknown): T[] =>
  (Array.isArray(result)
    ? result
    : ((result as { rows?: T[] })?.rows ?? [])) as T[];
let driveAccessTokenCache: { refreshTokenCiphertext: string; accessToken: string; expiresAt: number } | null = null;
function secret(context: LoaderContext) {
  const value = context?.cf?.env?.YOUTUBE_TOKEN_SECRET || globalThis.process?.env?.YOUTUBE_TOKEN_SECRET;
  if (!value || value.length < 32 || value === "local-dev-session-secret-change-in-production")
    throw new Response("Configure a strong YOUTUBE_TOKEN_SECRET before connecting video storage.", { status: 503 });
  return value;
}
export function googleDriveOAuthConfig(context: LoaderContext) {
  const google = youtubeOAuthConfig(context), app = new URL(google.appUrl);
  const accountEmail = context?.cf?.env?.GOOGLE_DRIVE_ACCOUNT_EMAIL || globalThis.process?.env?.GOOGLE_DRIVE_ACCOUNT_EMAIL;
  if (!accountEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail.trim()))
    throw new Response("Configure GOOGLE_DRIVE_ACCOUNT_EMAIL for the Drive storage account.", { status: 503 });
  return { ...google, redirectUri: new URL(CALLBACK, app).href, accountEmail: accountEmail.trim().toLowerCase() };
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function encryptionKey(context: LoaderContext) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`edicut:google-drive:v1:${secret(context)}`)),
    { name: "AES-GCM" }, false, ["encrypt", "decrypt"],
  );
}
export async function encryptGoogleDriveSecret(value: string, context: LoaderContext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(context), new TextEncoder().encode(value));
  return `v1.${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function decryptGoogleDriveSecret(value: string, context: LoaderContext) {
  const [version, iv, cipher] = value.split(".");
  if (version !== "v1" || !iv || !cipher) throw new Error("Invalid Google Drive credential");
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, await encryptionKey(context), decode(cipher)));
}
type DriveConnection = { refreshToken: string; connectedAt: string };
export type GoogleDriveStorageQuota = {
  accountUsageBytes: number | null;
  driveUsageBytes: number | null;
  limitBytes: number | null;
};
export type GoogleDriveStorageQuotaResult =
  | { status: "not-connected" }
  | { status: "unavailable"; reason: "configuration" | "encryption" | "authorization" | "permission" | "provider" | "response" }
  | { status: "connected"; quota: GoogleDriveStorageQuota };
async function connection(db: DatabaseClient) {
  return rows<DriveConnection>(await db.execute(sql`SELECT refresh_token AS "refreshToken",connected_at AS "connectedAt" FROM video_storage_connections WHERE provider='google_drive'`))[0];
}
export async function getGoogleDriveStorageStatus(db: DatabaseClient) {
  const value = await connection(db);
  return value
    ? { connected: true, channelName: "EdiCut Studio Google Drive", connectedAt: value.connectedAt }
    : { connected: false, channelName: undefined, connectedAt: undefined };
}
function stateCookie(request: Request, context: LoaderContext) {
  return createCookie("_edicut_drive_connect", {
    httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:",
    path: CALLBACK, maxAge: 600, secrets: [secret(context)],
  });
}
export async function disconnectGoogleDriveStorage(db: DatabaseClient, adminId: string) {
  await db.execute(sql`DELETE FROM video_storage_connections WHERE provider='google_drive' AND EXISTS(SELECT 1 FROM admin_users WHERE id=${adminId}::uuid AND active AND role='admin')`);
}
export async function startGoogleDriveConnection(request: Request, context: LoaderContext, adminId: string) {
  const config = googleDriveOAuthConfig(context), nonce = crypto.randomUUID();
  const verifier = encode(crypto.getRandomValues(new Uint8Array(48))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const challenge = encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: `openid email ${GOOGLE_DRIVE_SCOPE}`,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent select_account",
    login_hint: config.accountEmail,
    state: nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return redirect(url.href, { headers: {
    "Set-Cookie": await stateCookie(request, context).serialize({ nonce, verifier, adminId, expires: Date.now() + 600000 }),
    "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}
export async function completeGoogleDriveConnection(request: Request, context: LoaderContext, db: DatabaseClient) {
  const cookie = stateCookie(request, context), clear = await cookie.serialize("", { maxAge: 0 });
  const result = (status: string) => {
    const destination = `${SETTINGS}?drive=${status}`;
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${destination}"><title>Returning to video storage</title></head><body><p>Returning to your workspace…</p><a href="${destination}">Continue to video storage</a></body></html>`, {
      headers: { "Set-Cookie": clear, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; base-uri 'none'; form-action 'none'", "X-Robots-Tag": "noindex,nofollow" },
    });
  };
  try {
    const state = await cookie.parse(request.headers.get("Cookie")), url = new URL(request.url);
    if (!state || state.nonce !== url.searchParams.get("state") || typeof state.expires !== "number" || state.expires < Date.now() || !isWorkspaceRecordId(state.adminId) || typeof state.verifier !== "string" || state.verifier.length < 43)
      return result("invalid-state");
    if (url.searchParams.has("error")) return result("cancelled");
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) return result("invalid-code");
    const admin = rows(await db.execute(sql`SELECT id FROM admin_users WHERE id=${state.adminId}::uuid AND active AND role='admin'`));
    if (!admin.length) return result("inactive-admin");
    const config = googleDriveOAuthConfig(context);
    const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, grant_type: "authorization_code", code, code_verifier: state.verifier }),
    });
    const token = await response.json() as { access_token?: string; refresh_token?: string; scope?: string };
    if (!response.ok || !token.access_token || !token.refresh_token || !token.scope?.split(" ").includes(GOOGLE_DRIVE_SCOPE)) return result("permissions");
    const profileResponse = await fetchWithTimeout("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = await profileResponse.json() as { email?: string; email_verified?: boolean };
    if (!profileResponse.ok || profile.email_verified !== true || profile.email?.trim().toLowerCase() !== config.accountEmail) return result("account");
    const encrypted = await encryptGoogleDriveSecret(token.refresh_token, context);
    const saved = await db.execute(sql`INSERT INTO video_storage_connections(provider,channel_id,channel_name,refresh_token,connected_by,connected_at)
      SELECT 'google_drive','drive','EdiCut Studio Google Drive',${encrypted},a.id,clock_timestamp() FROM admin_users a WHERE a.id=${state.adminId}::uuid AND a.active AND a.role='admin'
      ON CONFLICT(provider) DO UPDATE SET channel_id=excluded.channel_id,channel_name=excluded.channel_name,refresh_token=excluded.refresh_token,connected_by=excluded.connected_by,connected_at=excluded.connected_at RETURNING provider`);
    return result(rows(saved).length ? "connected" : "save-failed");
  } catch {
    return result("unavailable");
  }
}
export async function googleDriveAccessToken(db: DatabaseClient, context: LoaderContext) {
  const stored = await connection(db);
  if (!stored) { driveAccessTokenCache = null; throw new Response("Connect EdiCut Studio Google Drive before uploading files.", { status: 503 }); }
  if (driveAccessTokenCache?.refreshTokenCiphertext === stored.refreshToken && driveAccessTokenCache.expiresAt > Date.now() + 15_000)
    return driveAccessTokenCache.accessToken;
  const config = googleDriveOAuthConfig(context);
  let refresh: string;
  try {
    refresh = await decryptGoogleDriveSecret(stored.refreshToken, context);
  } catch {
    throw new Response("The saved Google Drive credential could not be decrypted.", { status: 503 });
  }
  const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST", body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "refresh_token", refresh_token: refresh }),
  });
  const value = await response.json() as { access_token?: string; scope?: string; expires_in?: number };
  if (!response.ok || !value.access_token) throw new Response("Google Drive authorization expired. An administrator needs to reconnect storage.", { status: 503 });
  const lifetimeSeconds = Number.isSafeInteger(value.expires_in) && (value.expires_in ?? 0) > 0 ? value.expires_in! : 300;
  driveAccessTokenCache = {
    refreshTokenCiphertext: stored.refreshToken,
    accessToken: value.access_token,
    expiresAt: Date.now() + Math.max(15, lifetimeSeconds - 60) * 1000,
  };
  return value.access_token;
}
function invalidateGoogleDriveAccessToken(token: string) {
  if (driveAccessTokenCache?.accessToken === token) driveAccessTokenCache = null;
}
function parseGoogleStorageBytes(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !/^\d+$/.test(value)) return null;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
}
export async function getGoogleDriveStorageQuota(db: DatabaseClient, context: LoaderContext): Promise<GoogleDriveStorageQuotaResult> {
  try {
    if (!await connection(db)) return { status: "not-connected" };
    const token = await googleDriveAccessToken(db, context);
    const response = await fetchWithTimeout(
      "https://www.googleapis.com/drive/v3/about?fields=storageQuota(limit,usage,usageInDrive)",
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!response.ok) {
      const reason = response.status === 401 ? "authorization"
        : response.status === 403 ? "permission"
          : response.status === 429 || response.status >= 500 ? "provider" : "response";
      return { status: "unavailable", reason };
    }
    const value = await response.json() as {
      storageQuota?: { limit?: unknown; usage?: unknown; usageInDrive?: unknown };
    };
    if (!value.storageQuota) return { status: "unavailable", reason: "response" };
    const { limit, usage, usageInDrive } = value.storageQuota;
    const limitBytes = limit === undefined ? null : parseGoogleStorageBytes(limit);
    if (limit !== undefined && limitBytes === null) return { status: "unavailable", reason: "response" };
    return {
      status: "connected",
      quota: {
        accountUsageBytes: parseGoogleStorageBytes(usage),
        driveUsageBytes: parseGoogleStorageBytes(usageInDrive),
        limitBytes,
      },
    };
  } catch (error) {
    if (error instanceof Response) {
      const message = await error.clone().text().catch(() => "");
      return {
        status: "unavailable",
        reason: /Configure/.test(message) ? "configuration" : /could not be decrypted/i.test(message) ? "encryption" : /authorization|credential|connect EdiCut/i.test(message) ? "authorization" : "response",
      };
    }
    return {
      status: "unavailable",
      reason: error instanceof Error && error.name === "OperationError" ? "authorization" : "provider",
    };
  }
}
export function safeGoogleDriveUploadUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === "https://www.googleapis.com" && url.pathname === "/upload/drive/v3/files" && url.searchParams.get("uploadType") === "resumable" && Boolean(url.searchParams.get("upload_id")) && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}
export async function beginGoogleDriveUpload(accessToken: string, bytes: number, mime: string, name: string, description = "Private EdiCut project review video.") {
  const response = await fetchWithTimeout("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(bytes), "X-Upload-Content-Type": mime },
    body: JSON.stringify({ name, mimeType: mime, description }),
  });
  const url = safeGoogleDriveUploadUrl(response.headers.get("Location") || "");
  if (!response.ok || !url) throw new Response(response.status === 403 ? "Google Drive could not start this upload. Check the account’s storage quota and Drive API permissions." : "Google Drive upload could not be started. Try again.", { status: 502 });
  return url;
}
export async function sendGoogleDriveUpload(url: string, token: string, range: string, body: ArrayBuffer | null, mime: string) {
  const safe = safeGoogleDriveUploadUrl(url);
  if (!safe) throw new Error("Invalid stored Google Drive upload URL");
  const response = await fetchWithTimeout(safe, { method: "PUT", redirect: "manual", headers: { Authorization: `Bearer ${token}`, "Content-Range": range, "Content-Type": mime }, body }, UPLOAD_FETCH_TIMEOUT_MS);
  if (response.status === 401) invalidateGoogleDriveAccessToken(token);
  return response;
}

export function googleDriveUploadStatusRange(bytes: number) {
  return `bytes */${bytes}`;
}
export function safeGoogleDriveFileId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 240 && /^[A-Za-z0-9_-]+$/.test(value);
}
export async function verifyGoogleDriveFile(id: string, bytes: number, mime: string, token: string) {
  if (!safeGoogleDriveFileId(id)) throw new Response("Google Drive returned an invalid file identifier.", { status: 502 });
  const response = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,mimeType,size,trashed`, { headers: { Authorization: `Bearer ${token}` } });
  const file = await response.json() as { id?: string; mimeType?: string; size?: string; trashed?: boolean };
  if (response.status === 401) invalidateGoogleDriveAccessToken(token);
  if (!response.ok || file.id !== id || file.mimeType !== mime || Number(file.size) !== bytes || file.trashed === true)
    throw new Response("Google Drive could not confirm the uploaded file. Try again.", { status: 502 });
}
export async function downloadGoogleDriveFile(id: string, token: string, range?: string | null, signal?: AbortSignal) {
  if (!safeGoogleDriveFileId(id)) throw new Response("Attachment unavailable.", { status: 404 });
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) throw new Response("Unsupported attachment range.", { status: 416 });
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (range) headers.set("Range", range);
  const response = await fetchWithHeadersTimeout(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
    headers, cache: "no-store", signal,
  });
  if (response.status === 401) invalidateGoogleDriveAccessToken(token);
  if (!response.ok && response.status !== 416) throw new Response(response.status === 404 ? "Attachment unavailable." : "Attachment download is temporarily unavailable.", { status: response.status === 404 ? 404 : 502 });
  return response;
}
export async function deleteGoogleDriveFile(id: string, token: string) {
  if (!safeGoogleDriveFileId(id)) throw new Error("Invalid Google Drive file identifier");
  const response = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) invalidateGoogleDriveAccessToken(token);
  if (!response.ok && response.status !== 404) throw new Error("Google Drive chat attachment cleanup failed");
}
