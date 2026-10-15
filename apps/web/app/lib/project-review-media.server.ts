import type { LoaderContext } from "../types";
import { requireCloudinaryEnv, signUpload } from "./cloudinary.server";
import {
  fetchWithTimeout,
  UPLOAD_FETCH_TIMEOUT_MS,
} from "@edicut/shared/server-fetch";
import { REVIEW_MAX_BYTES } from "./project-review";
import type { DatabaseClient } from "@edicut/db/client";
import { googleDriveAccessToken, safeGoogleDriveFileId } from "./google-drive-storage.server";

export async function validateReviewVideo(file: File) {
  if (
    !file.size ||
    file.size > REVIEW_MAX_BYTES ||
    !["video/mp4", "video/webm"].includes(file.type)
  )
    return "Choose an MP4 or WebM video up to 50 MB.";
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const mp4 = String.fromCharCode(...head.slice(4, 8)) === "ftyp";
  const webm =
    head[0] === 0x1a &&
    head[1] === 0x45 &&
    head[2] === 0xdf &&
    head[3] === 0xa3;
  return (file.type === "video/mp4" ? mp4 : webm)
    ? null
    : "This file does not match its video format.";
}
export function reviewMediaId(
  projectId: string,
  versionId: string,
  mime: string,
) {
  return `edicut/reviews/${projectId}/${versionId}.${mime === "video/mp4" ? "mp4" : "webm"}`;
}
export async function uploadReviewVideo(
  file: File,
  publicId: string,
  context: LoaderContext,
) {
  const error = await validateReviewVideo(file);
  if (error) throw new Response(error, { status: 400 });
  const env = await requireCloudinaryEnv(context, "video");
  const params = {
    public_id: publicId,
    type: "private",
    overwrite: "false",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const form = new FormData();
  form.set("file", file);
  form.set("api_key", env.apiKey!);
  for (const [key, value] of Object.entries(params))
    form.set(key, String(value));
  form.set("signature", await signUpload(params, env.apiSecret!));
  const response = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${env.cloudName}/raw/upload`,
    { method: "POST", body: form },
    UPLOAD_FETCH_TIMEOUT_MS,
  );
  const result = (await response.json()) as {
    public_id?: string;
    type?: string;
    resource_type?: string;
    bytes?: number;
  };
  if (
    !response.ok ||
    result.public_id !== publicId ||
    result.type !== "private" ||
    result.resource_type !== "raw" ||
    result.bytes !== file.size
  )
    throw new Response("Video upload could not be confirmed. Try again.", {
      status: 502,
    });
}
export async function deleteReviewVideo(
  publicId: string,
  context: LoaderContext,
) {
  const env = await requireCloudinaryEnv(context, "video");
  const params = {
    public_id: publicId,
    type: "private",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const form = new FormData();
  form.set("api_key", env.apiKey!);
  for (const [key, value] of Object.entries(params))
    form.set(key, String(value));
  form.set("signature", await signUpload(params, env.apiSecret!));
  const response = await fetchWithTimeout(
    `https://api.cloudinary.com/v1_1/${env.cloudName}/raw/destroy`,
    { method: "POST", body: form },
  );
  if (!response.ok) throw new Error("Review upload cleanup failed");
}
export async function streamReviewVideo(
  media: { publicId: string; mime: string; bytes: number },
  request: Request,
  context: LoaderContext,
) {
  // No arbitrary URLs: private assets are addressed only by server-stored identifiers.
  const range = request.headers.get("Range");
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${media.bytes}`,
        "Cache-Control": "no-store",
      },
    });
  const env = await requireCloudinaryEnv(context, "video");
  const params = {
    public_id: media.publicId,
    type: "private",
    timestamp: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 60,
  };
  const query = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
    api_key: env.apiKey!,
    signature: await signUpload(params, env.apiSecret!),
  });
  // Bound the wait for headers, not the entire streamed movie. The shared fetch
  // helper's full-request deadline would interrupt playback on slower connections.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${env.cloudName}/raw/download?${query}`,
      {
        headers: range ? { Range: range } : undefined,
        signal: AbortSignal.any([request.signal, controller.signal]),
      },
    );
  } finally {
    clearTimeout(timeout);
  }
  if (![200, 206, 416].includes(response.status))
    throw new Response(
      "Video playback is temporarily unavailable. Reload the player to try again.",
      { status: 502 },
    );
  const headers = new Headers({
    "Content-Type": media.mime,
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  });
  for (const key of ["Content-Length", "Content-Range"]) {
    const value = response.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (response.status === 416) {
    if (!headers.has("Content-Range"))
      headers.set("Content-Range", `bytes */${media.bytes}`);
    return new Response(null, { status: 416, headers });
  }
  return new Response(response.body, { status: response.status, headers });
}

function safeGoogleDownloadUrl(value: string) {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password &&
      (host === "google.com" || host.endsWith(".google.com") || host === "googleapis.com" || host.endsWith(".googleapis.com") || host === "googleusercontent.com" || host.endsWith(".googleusercontent.com"))
      ? url.href
      : null;
  } catch { return null; }
}

/** Serves an app-owned Drive file only after the project route rechecks reviewer access. */
export async function streamGoogleDriveReviewVideo(
  media: { driveFileId: string; mime: string; bytes: number },
  request: Request,
  db: DatabaseClient,
  context: LoaderContext,
) {
  const range = request.headers.get("Range");
  if (!safeGoogleDriveFileId(media.driveFileId))
    throw new Response("Video not found.", { status: 404 });
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${media.bytes}`, "Cache-Control": "no-store" } });

  const token = await googleDriveAccessToken(db, context);
  const endpoint = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(media.driveFileId)}?alt=media`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const signal = AbortSignal.any([request.signal, controller.signal]);
  let response: Response;
  try {
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    if (range) headers.set("Range", range);
    response = await fetchWithTimeout(endpoint, { headers, redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("Location"), target = location ? safeGoogleDownloadUrl(new URL(location, endpoint).href) : null;
      if (!target) throw new Response("Google Drive returned an unsafe download location.", { status: 502 });
      const redirectedHeaders = new Headers();
      if (range) redirectedHeaders.set("Range", range);
      response = await fetchWithTimeout(target, { headers: redirectedHeaders, redirect: "follow", signal });
    }
  } catch (error) {
    if (error instanceof Response) throw error;
    if (request.signal.aborted)
      return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
    throw new Response("Video playback is temporarily unavailable. Reload the player to try again.", { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
  if (![200, 206, 416].includes(response.status))
    throw new Response(response.status === 404 ? "This Drive video is no longer available." : "Video playback is temporarily unavailable. Reload the player to try again.", { status: response.status === 404 ? 404 : 502 });
  const headers = new Headers({
    "Content-Type": media.mime,
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  });
  for (const key of ["Content-Length", "Content-Range"]) {
    const value = response.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (response.status === 416) {
    if (!headers.has("Content-Range")) headers.set("Content-Range", `bytes */${media.bytes}`);
    return new Response(null, { status: 416, headers });
  }
  return new Response(request.method === "HEAD" || !response.body ? null : suppressClientAbort(response.body, request.signal), { status: response.status, headers });
}

function suppressClientAbort(body: ReadableStream<Uint8Array>, requestSignal: AbortSignal) {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const part = await reader.read();
        if (part.done) controller.close();
        else controller.enqueue(part.value);
      } catch (error) {
        if (requestSignal.aborted) {
          try { controller.close(); } catch { /* The client may already have canceled the stream. */ }
          return;
        }
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); }
      catch (error) { if (!requestSignal.aborted) throw error; }
    },
  });
}
