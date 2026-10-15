import { createCookie, redirect } from "react-router";
import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import type { LoaderContext } from "../types";
import { fetchWithTimeout } from "@edicut/shared/server-fetch";
import { readRequiredGoogleEnv } from "./google-auth.server";
import { isWorkspaceRecordId } from "./workspace";

const CALLBACK = "/api/auth/callback/youtube";
const SETTINGS = "/site/node-logmin/video-storage";
const SCOPE =
  "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
const rows = <T>(result: unknown): T[] =>
  (Array.isArray(result)
    ? result
    : ((result as { rows?: T[] })?.rows ?? [])) as T[];
type Connection = {
  channelId: string;
  channelName: string;
  refreshToken: string;
  connectedAt: string;
};
function env(context: LoaderContext, name: string) {
  return context?.cf?.env?.[name] || globalThis.process?.env?.[name];
}
function secret(context: LoaderContext) {
  const value = env(context, "YOUTUBE_TOKEN_SECRET");
  if (
    !value ||
    value.length < 32 ||
    value === "local-dev-session-secret-change-in-production"
  )
    throw new Response(
      "Configure a strong YOUTUBE_TOKEN_SECRET before connecting video storage.",
      { status: 503 },
    );
  return value;
}
export function youtubeOAuthConfig(context: LoaderContext) {
  const clientId = env(context, "YOUTUBE_OAUTH_CLIENT_ID")?.trim(),
    clientSecret = env(context, "YOUTUBE_OAUTH_CLIENT_SECRET")?.trim();
  // Keep studio storage credentials independent of customer Google sign-in.
  // Never silently mix clients if only one dedicated credential is configured.
  if (Boolean(clientId) !== Boolean(clientSecret))
    throw new Response("Configure both YouTube OAuth client credentials.", {
      status: 503,
    });
  const google = clientId && clientSecret
      ? {
          clientId,
          clientSecret,
          appUrl: env(context, "APP_URL") || env(context, "NEXT_PUBLIC_APP_URL") || "http://localhost:3002",
        }
      : readRequiredGoogleEnv(context),
    app = new URL(google.appUrl);
  if (
    app.username || app.password ||
    (app.protocol !== "https:" &&
      !(app.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(app.hostname)))
  )
    throw new Response("Video storage requires HTTPS.", { status: 503 });
  secret(context);
  return { ...google, redirectUri: new URL(CALLBACK, app).href };
}
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (value: string) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
async function key(context: LoaderContext) {
  return crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`edicut:youtube:v1:${secret(context)}`),
    ),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptYouTubeSecret(
  value: string,
  context: LoaderContext,
) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(context),
    new TextEncoder().encode(value),
  );
  return `v1.${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function decryptYouTubeSecret(
  value: string,
  context: LoaderContext,
) {
  const [version, iv, cipher] = value.split(".");
  if (version !== "v1" || !iv || !cipher)
    throw new Error("Invalid video storage credential");
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decode(iv) },
      await key(context),
      decode(cipher),
    ),
  );
}
async function connection(db: DatabaseClient) {
  return rows<Connection>(
    await db.execute(
      sql`SELECT channel_id AS "channelId",channel_name AS "channelName",refresh_token AS "refreshToken",connected_at AS "connectedAt" FROM video_storage_connections WHERE provider='youtube'`,
    ),
  )[0];
}
export async function getYouTubeStorageStatus(db: DatabaseClient) {
  const value = await connection(db);
  return value
    ? {
        connected: true,
        channelName: value.channelName,
        channelId: value.channelId,
        connectedAt: value.connectedAt,
      }
    : {
        connected: false,
        channelName: undefined,
        channelId: undefined,
        connectedAt: undefined,
      };
}
function stateCookie(request: Request, context: LoaderContext) {
  return createCookie("_edicut_youtube_connect", {
    httpOnly: true,
    sameSite: "lax",
    secure: new URL(request.url).protocol === "https:",
    path: CALLBACK,
    maxAge: 600,
    secrets: [secret(context)],
  });
}
export async function disconnectYouTubeStorage(
  db: DatabaseClient,
  adminId: string,
) {
  await db.execute(
    sql`DELETE FROM video_storage_connections WHERE provider='youtube' AND EXISTS(SELECT 1 FROM admin_users WHERE id=${adminId}::uuid AND active AND role='admin')`,
  );
}
export async function startYouTubeConnection(
  request: Request,
  context: LoaderContext,
  adminId: string,
) {
  const config = youtubeOAuthConfig(context),
    nonce = crypto.randomUUID(),
    verifier = encode(crypto.getRandomValues(new Uint8Array(48)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const challenge = encode(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent select_account",
    state: nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return redirect(url.href, {
    headers: {
      "Set-Cookie": await stateCookie(request, context).serialize({
        nonce,
        verifier,
        adminId,
        expires: Date.now() + 600000,
      }),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
export async function completeYouTubeConnection(
  request: Request,
  context: LoaderContext,
  db: DatabaseClient,
) {
  const cookie = stateCookie(request, context),
    clear = await cookie.serialize("", { maxAge: 0 });
  // Commit a first-party document before navigating back. An HTTP redirect
  // from Google can otherwise omit the administrator's SameSite=Strict cookie.
  const result = (status: string) => {
    const destination = `${SETTINGS}?connection=${status}`;
    return new Response(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=${destination}"><title>Returning to video storage</title></head><body><p>Returning to your workspace…</p><a href="${destination}">Continue to video storage</a></body></html>`,
      {
        headers: {
          "Set-Cookie": clear,
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "Content-Security-Policy":
            "default-src 'none'; base-uri 'none'; form-action 'none'",
          "X-Robots-Tag": "noindex,nofollow",
        },
      },
    );
  };
  try {
    const state = await cookie.parse(request.headers.get("Cookie")),
      url = new URL(request.url);
    if (
      !state ||
      state.nonce !== url.searchParams.get("state") ||
      typeof state.expires !== "number" ||
      state.expires < Date.now() ||
      !isWorkspaceRecordId(state.adminId) ||
      typeof state.verifier !== "string" ||
      state.verifier.length < 43
    )
      return result("invalid");
    if (url.searchParams.has("error")) return result("cancelled");
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) return result("invalid");
    const admin = rows(
      await db.execute(
        sql`SELECT id FROM admin_users WHERE id=${state.adminId}::uuid AND active AND role='admin'`,
      ),
    );
    if (!admin.length) return result("invalid");
    const config = youtubeOAuthConfig(context);
    const response = await fetchWithTimeout(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: "authorization_code",
          code,
          code_verifier: state.verifier,
        }),
      },
    );
    const token = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      scope?: string;
    };
    if (
      !response.ok ||
      !token.access_token ||
      !token.refresh_token ||
      !SCOPE.split(" ").every((scope) =>
        token.scope?.split(" ").includes(scope),
      )
    )
      return result("permissions");
    const channelResponse = await fetchWithTimeout(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${token.access_token}` } },
    );
    const channels = (await channelResponse.json()) as {
      items?: { id?: string; snippet?: { title?: string } }[];
    };
    const channel = channels.items?.[0];
    if (
      !channelResponse.ok ||
      !channel?.id ||
      !/^UC[\w-]{22}$/.test(channel.id)
    )
      return result("channel");
    const encrypted = await encryptYouTubeSecret(token.refresh_token, context);
    // The signed, short-lived PKCE state is bound to the administrator who started
    // connection. Recheck their active role in the write, including after consent.
    const saved =
      await db.execute(sql`INSERT INTO video_storage_connections(provider,channel_id,channel_name,refresh_token,connected_by,connected_at)
      SELECT 'youtube',${channel.id},${(channel.snippet?.title || "YouTube channel").slice(0, 160)},${encrypted},a.id,clock_timestamp() FROM admin_users a WHERE a.id=${state.adminId}::uuid AND a.active AND a.role='admin'
      ON CONFLICT(provider) DO UPDATE SET channel_id=excluded.channel_id,channel_name=excluded.channel_name,refresh_token=excluded.refresh_token,connected_by=excluded.connected_by,connected_at=excluded.connected_at RETURNING provider`);
    return result(rows(saved).length ? "connected" : "invalid");
  } catch {
    return result("unavailable");
  }
}
export async function youtubeAccessToken(
  db: DatabaseClient,
  context: LoaderContext,
  expectedChannel?: string,
) {
  const stored = await connection(db);
  if (!stored || (expectedChannel && stored.channelId !== expectedChannel))
    throw new Response(
      "Connect the original YouTube channel before continuing this upload.",
      { status: 503 },
    );
  const config = youtubeOAuthConfig(context),
    refresh = await decryptYouTubeSecret(stored.refreshToken, context);
  const response = await fetchWithTimeout(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refresh,
      }),
    },
  );
  const value = (await response.json()) as { access_token?: string };
  if (!response.ok || !value.access_token)
    throw new Response(
      "YouTube authorization expired. An administrator needs to reconnect the channel.",
      { status: 503 },
    );
  return { accessToken: value.access_token, channelId: stored.channelId };
}
export function safeYouTubeUploadUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === "https://www.googleapis.com" &&
      url.pathname === "/upload/youtube/v3/videos" &&
      url.searchParams.get("uploadType") === "resumable" &&
      Boolean(url.searchParams.get("upload_id")) &&
      !url.username &&
      !url.password &&
      !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export async function beginYouTubeUpload(
  accessToken: string,
  bytes: number,
  mime: string,
  title: string,
) {
  const response = await fetchWithTimeout(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,contentDetails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(bytes),
        "X-Upload-Content-Type": mime,
      },
      body: JSON.stringify({
        snippet: {
          title,
          description:
            "EdiCut project review. Shared as an unlisted video for feedback.",
          categoryId: "22",
        },
        status: {
          privacyStatus: "unlisted",
          embeddable: true,
          selfDeclaredMadeForKids: false,
        },
      }),
    },
  );
  const url = safeYouTubeUploadUrl(response.headers.get("Location") || "");
  if (!response.ok || !url)
    throw new Response(
      response.status === 403
        ? "YouTube could not start this upload. Check the channel’s upload allowance and API permissions."
        : "YouTube upload could not be started. Try again.",
      { status: 502 },
    );
  return url;
}
export async function sendYouTubeUpload(
  url: string,
  token: string,
  range: string,
  body: ArrayBuffer | null,
  mime: string,
) {
  const safe = safeYouTubeUploadUrl(url);
  if (!safe) throw new Error("Invalid stored YouTube upload URL");
  return fetchWithTimeout(
    safe,
    {
      method: "PUT",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Range": range,
        "Content-Type": mime,
      },
      body,
    },
    120000,
  );
}
export async function verifyYouTubeVideo(
  id: string,
  channelId: string,
  token: string,
) {
  if (!/^[\w-]{11}$/.test(id))
    throw new Response("YouTube returned an invalid video identifier.", {
      status: 502,
    });
  const response = await fetchWithTimeout(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${id}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const value = (await response.json()) as {
    items?: {
      id: string;
      snippet?: { channelId: string };
      status?: {
        privacyStatus: string;
        embeddable: boolean;
        uploadStatus: string;
      };
    }[];
  };
  const video = value.items?.[0];
  if (
    !response.ok ||
    video?.id !== id ||
    video.snippet?.channelId !== channelId ||
    video.status?.privacyStatus !== "unlisted" ||
    !video.status?.embeddable ||
    ["failed", "rejected", "deleted"].includes(video.status.uploadStatus)
  )
    throw new Response(
      "This video is not available as an embeddable unlisted review. Check the upload in YouTube Studio.",
      { status: 502 },
    );
}
