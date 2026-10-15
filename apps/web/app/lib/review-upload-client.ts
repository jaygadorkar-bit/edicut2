import { REVIEW_UPLOAD_CHUNK_BYTES, type ReviewResult } from "./project-review";
export function sendReviewForm(
  url: string,
  form: FormData,
  progress?: (value: number) => void,
): Promise<ReviewResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.timeout = 180000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress?.(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("Connection interrupted"));
    request.ontimeout = () => reject(new Error("Request timed out"));
    request.onload = () => {
      try {
        const response = JSON.parse(request.responseText) as ReviewResult;
        resolve(
          request.status >= 200 && request.status < 300
            ? response
            : {
                error:
                  response.error ||
                  "This action is no longer available. Refresh and try again.",
              },
        );
      } catch {
        resolve({
          error:
            "Your session or connection changed. Refresh the page before trying again.",
        });
      }
    };
    // Send text-only actions as small forms, rather than video multipart uploads.
    const body = [...form.values()].some((value) => typeof value !== "string")
      ? form
      : new URLSearchParams([...form].map(([name, value]) => [name, String(value)]));
    request.send(body);
  });
}
type Send = (
  url: string,
  form: FormData,
  progress?: (percent: number) => void,
) => Promise<ReviewResult>;
export async function uploadReviewToStorage(
  api: string,
  form: FormData,
  send: Send,
  progress?: (percent: number) => void,
): Promise<ReviewResult> {
  const file = form.get("video");
  if (!(file instanceof File)) return { error: "Choose a video first." };
  const init = new FormData();
  for (const [name, value] of form) if (name !== "video") init.set(name, value);
  init.set("intent", "init-video-upload");
  init.set("provider", String(form.get("provider") || "youtube"));
  init.set("bytes", String(file.size));
  init.set("mime", file.type);
  const started = await send(api, init);
  if (started.error || started.versionId) return started;
  const id = started.uploadId;
  if (!id) return { error: "The upload could not be started. Try again." };
  const step = (intent: string) => {
    const data = new FormData();
    data.set("intent", intent);
    data.set("uploadId", id);
    return send(api, data);
  };
  let status = await step("status-video-upload");
  if (status.error || status.versionId) return status;
  let offset = status.offset ?? 0,
    retries = 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > file.size)
    return {
      error: "Upload progress could not be confirmed. Choose the file again.",
    };
  while (offset < file.size) {
    const end = Math.min(file.size, offset + REVIEW_UPLOAD_CHUNK_BYTES),
      url = new URL(api, window.location.origin);
    url.searchParams.set("upload", id);
    url.searchParams.set("offset", String(offset));
    try {
      const result = await sendChunk(
        url.pathname + url.search,
        file.slice(offset, end),
        (loaded) =>
          progress?.(
            Math.min(98, Math.round(((offset + loaded) / file.size) * 98)),
          ),
      );
      if (result.error) throw new Error(result.error);
      if (
        !Number.isSafeInteger(result.offset) ||
        result.offset! <= offset ||
        result.offset! > file.size
      )
        return {
          error: "Upload progress did not advance. Retry to resume the video.",
        };
      offset = result.offset!;
      retries = 0;
    } catch (error) {
      if (retries >= 2)
        return {
          error:
            error instanceof Error
              ? error.message
              : "The connection dropped. Retry to resume your upload.",
        };
      await new Promise((resolve) => setTimeout(resolve, 750 * 2 ** retries++));
      status = await step("status-video-upload");
      if (status.error) return status;
      if (status.versionId) return status;
      if (
        !Number.isSafeInteger(status.offset) ||
        status.offset! < offset ||
        status.offset! > file.size
      )
        return {
          error: "The upload position could not be recovered. Try again.",
        };
      offset = status.offset!;
    }
  }
  progress?.(99);
  const saved = await step("finish-video-upload");
  if (!saved.error) progress?.(100);
  return saved;
}
function sendChunk(
  url: string,
  body: Blob,
  progress: (loaded: number) => void,
): Promise<ReviewResult> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.timeout = 150000;
    request.upload.onprogress = (event) => progress(event.loaded);
    request.onerror = () =>
      reject(new Error("Connection interrupted. Retry to resume the upload."));
    request.ontimeout = () =>
      reject(new Error("The upload timed out. Retry to resume the upload."));
    request.onload = () => {
      try {
        const value = JSON.parse(request.responseText) as ReviewResult;
        resolve(
          request.status >= 200 && request.status < 300
            ? value
            : {
                error:
                  value.error ||
                  "This upload could not be confirmed. Retry to resume.",
              },
        );
      } catch {
        reject(
          new Error(
            "Your session changed. Sign in again and retry the upload.",
          ),
        );
      }
    };
    request.send(body);
  });
}
