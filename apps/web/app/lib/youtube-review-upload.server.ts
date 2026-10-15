import type { ActionFunctionArgs } from "react-router";
import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import {
  REVIEW_MAX_DURATION_MS,
  REVIEW_UPLOAD_CHUNK_BYTES,
  YOUTUBE_REVIEW_MAX_BYTES,
  type ReviewActor,
  type ReviewResult,
} from "./project-review";
import {
  projectReviewAccessSql,
  reviewRows,
  saveReviewVersion,
} from "./project-review.server";
import { isWorkspaceRecordId } from "./workspace";
import {
  beginYouTubeUpload,
  decryptYouTubeSecret,
  encryptYouTubeSecret,
  sendYouTubeUpload,
  verifyYouTubeVideo,
  youtubeAccessToken,
} from "./youtube-storage.server";
type UploadSession = {
  id: string;
  actorKey: string;
  title: string;
  note: string;
  mime: string;
  bytes: number;
  durationMs: number;
  channelId: string | null;
  sessionUri: string | null;
  videoId: string | null;
  offset: number;
  status: string;
  leaseUntil: string | null;
};
const columns = sql`s.id,s.actor_key AS "actorKey",s.title,s.note,s.mime,s.bytes::double precision AS bytes,s.duration_ms AS "durationMs",s.channel_id AS "channelId",s.session_uri AS "sessionUri",s.video_id AS "videoId",s.received_bytes::double precision AS offset,s.status,s.lease_until AS "leaseUntil"`;
async function getUpload(
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
  id: string,
) {
  if (!isWorkspaceRecordId(id))
    throw new Response("Upload not found.", { status: 404 });
  const value = reviewRows<UploadSession>(
    await db.execute(
      sql`SELECT ${columns} FROM project_review_uploads s JOIN workspace_projects p ON p.id=s.project_id WHERE p.id=${projectId}::uuid AND s.id=${id}::uuid AND s.actor_key=${actor.key} AND s.expires_at>now() AND ${projectReviewAccessSql(actor, "upload")}`,
    ),
  )[0];
  if (!value)
    throw new Response(
      "Upload expired or project access changed. Choose the file again.",
      { status: 404 },
    );
  return value;
}
async function claim(
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
  id: string,
) {
  const claimed = reviewRows(
    await db.execute(
      sql`UPDATE project_review_uploads s SET lease_until=now()+interval '180 seconds' FROM workspace_projects p WHERE s.project_id=p.id AND s.id=${id}::uuid AND s.actor_key=${actor.key} AND (s.lease_until IS NULL OR s.lease_until<now()) AND s.expires_at>now() AND p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor, "upload")} RETURNING s.id`,
    ),
  );
  if (!claimed.length)
    throw new Response(
      "This upload is still transferring. Wait a moment and retry.",
      { status: 409 },
    );
}
async function release(db: DatabaseClient, id: string) {
  await db.execute(
    sql`UPDATE project_review_uploads SET lease_until=NULL WHERE id=${id}::uuid`,
  );
}
async function recordResponse(
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
  session: UploadSession,
  response: Response,
): Promise<ReviewResult> {
  let offset = session.offset,
    videoId = session.videoId;
  if (response.status === 308) {
    const range = response.headers.get("Range");
    if (range && !/^bytes=0-\d+$/.test(range))
      throw new Response("YouTube returned an invalid upload position.", {
        status: 502,
      });
    offset = range ? Number(range.slice(8)) + 1 : 0;
    if (
      !Number.isSafeInteger(offset) ||
      offset < session.offset ||
      offset > session.bytes
    )
      throw new Response("YouTube could not confirm this upload’s progress.", {
        status: 502,
      });
  } else if (response.ok) {
    const value = (await response.json()) as { id?: string };
    if (!value.id || !/^[\w-]{11}$/.test(value.id))
      throw new Response("YouTube could not confirm the uploaded video.", {
        status: 502,
      });
    videoId = value.id;
    offset = session.bytes;
  } else
    throw new Response(
      response.status === 404
        ? "This YouTube upload session expired. Choose the file again."
        : "YouTube could not receive this part of the video. Retry the upload to resume.",
      { status: 502 },
    );
  const saved = reviewRows(
    await db.execute(
      sql`UPDATE project_review_uploads s SET received_bytes=${offset},video_id=${videoId},status=${videoId ? "uploaded" : "uploading"} FROM workspace_projects p WHERE p.id=s.project_id AND p.id=${projectId}::uuid AND s.id=${session.id}::uuid AND s.actor_key=${actor.key} AND ${projectReviewAccessSql(actor, "upload")} RETURNING s.id`,
    ),
  );
  if (!saved.length)
    throw new Response(
      "Project access changed. The uploaded video was not added to the project.",
      { status: 403 },
    );
  return { uploadId: session.id, offset };
}
export async function youtubeUploadForm(
  args: ActionFunctionArgs,
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
  form: FormData,
): Promise<ReviewResult> {
  const intent = String(form.get("intent") ?? ""),
    id = String(form.get("uploadId") ?? "");
  if (!isWorkspaceRecordId(id))
    return { error: "Refresh the upload form and choose your video again." };
  const authorized = reviewRows(
    await db.execute(
      sql`SELECT p.id FROM workspace_projects p WHERE p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor, "upload")}`,
    ),
  );
  if (!authorized.length)
    throw new Response("Only the assigned project team can upload videos.", {
      status: 403,
    });
  const existing = reviewRows<{ id: string }>(
    await db.execute(
      sql`SELECT v.id FROM project_review_versions v WHERE v.id=${id}::uuid AND v.project_id=${projectId}::uuid AND v.actor_key=${actor.key} AND v.provider='youtube'`,
    ),
  );
  if (existing.length)
    return { success: "Video version uploaded.", versionId: id, uploadId: id };
  if (intent === "init-video-upload") {
    if (form.get("youtubeConsent") !== "yes")
      return {
        error:
          "Confirm that you have permission to share this video as unlisted before uploading.",
      };
    const title = String(form.get("title") ?? "").trim(),
      note = String(form.get("note") ?? "").trim(),
      mime = String(form.get("mime") ?? ""),
      bytes = Number(form.get("bytes")),
      duration = Number(form.get("durationMs"));
    if (/[<>\u0000-\u001f]/.test(title))
      return {
        error: "Video titles cannot contain <, >, or control characters.",
      };
    if (
      !title ||
      title.length > 100 ||
      note.length > 2000 ||
      !["video/mp4", "video/webm"].includes(mime) ||
      !Number.isSafeInteger(bytes) ||
      bytes < 16 ||
      bytes > YOUTUBE_REVIEW_MAX_BYTES ||
      !Number.isSafeInteger(duration) ||
      duration < 1 ||
      duration > REVIEW_MAX_DURATION_MS
    )
      return {
        error:
          "Choose an MP4 or WebM up to 10 GB and six hours long, with a title under 100 characters.",
      };
    const inserted = reviewRows(
      await db.execute(sql`INSERT INTO project_review_uploads(id,project_id,actor_key,title,note,mime,bytes,duration_ms,status)
      SELECT ${id}::uuid,p.id,${actor.key},${title},${note},${mime},${bytes},${duration},'starting' FROM workspace_projects p WHERE p.id=${projectId}::uuid AND ${projectReviewAccessSql(actor, "upload")} AND (SELECT count(*) FROM project_review_versions v WHERE v.project_id=p.id)<100 AND (SELECT count(*) FROM project_review_uploads s WHERE s.actor_key=${actor.key} AND s.expires_at>now() AND s.status IN ('starting','uploading','uploaded'))<5 ON CONFLICT(id) DO NOTHING RETURNING id`),
    );
    const session = await getUpload(db, actor, projectId, id);
    if (
      session.bytes !== bytes ||
      session.mime !== mime ||
      session.durationMs !== duration ||
      session.title !== title ||
      session.note !== note
    )
      return {
        error:
          "This upload belongs to an earlier draft. Choose the video again to start a new version.",
      };
    if (!inserted.length && session.status !== "failed")
      return session.sessionUri
        ? { uploadId: id, offset: session.offset }
        : {
            error:
              "The upload is still starting. Try again shortly, or choose the file again.",
          };
    if (!inserted.length) {
      const restarted = reviewRows(
        await db.execute(
          sql`UPDATE project_review_uploads SET status='starting' WHERE id=${id}::uuid AND actor_key=${actor.key} AND status='failed' RETURNING id`,
        ),
      );
      if (!restarted.length)
        return { error: "The upload is already starting. Try again shortly." };
    }
    try {
      const token = await youtubeAccessToken(db, args.context);
      const uri = await beginYouTubeUpload(
        token.accessToken,
        bytes,
        mime,
        title,
      );
      const encrypted = await encryptYouTubeSecret(uri, args.context);
      const stored = reviewRows(
        await db.execute(
          sql`UPDATE project_review_uploads s SET channel_id=${token.channelId},session_uri=${encrypted},status='uploading' FROM workspace_projects p WHERE p.id=s.project_id AND p.id=${projectId}::uuid AND s.id=${id}::uuid AND s.actor_key=${actor.key} AND ${projectReviewAccessSql(actor, "upload")} RETURNING s.id`,
        ),
      );
      if (!stored.length)
        throw new Response("Project access changed before upload started.", {
          status: 403,
        });
      return { uploadId: id, offset: 0 };
    } catch (error) {
      await db.execute(
        sql`UPDATE project_review_uploads SET status='failed' WHERE id=${id}::uuid AND actor_key=${actor.key}`,
      );
      throw error;
    }
  }
  const session = await getUpload(db, actor, projectId, id);
  if (intent === "status-video-upload") {
    if (["uploaded", "saved"].includes(session.status))
      return { uploadId: id, offset: session.bytes };
    if (!session.sessionUri || !session.channelId)
      return { error: "The upload has not started yet. Retry the upload." };
    await claim(db, actor, projectId, id);
    try {
      const token = await youtubeAccessToken(
        db,
        args.context,
        session.channelId,
      );
      const response = await sendYouTubeUpload(
        await decryptYouTubeSecret(session.sessionUri, args.context),
        token.accessToken,
        `bytes */${session.bytes}`,
        null,
        session.mime,
      );
      return await recordResponse(db, actor, projectId, session, response);
    } finally {
      await release(db, id);
    }
  }
  if (intent === "finish-video-upload") {
    if (
      !session.videoId ||
      !session.channelId ||
      session.offset !== session.bytes
    )
      return {
        error:
          "The video is still uploading. Retry to resume from the last received part.",
      };
    const token = await youtubeAccessToken(db, args.context, session.channelId);
    await verifyYouTubeVideo(
      session.videoId,
      session.channelId,
      token.accessToken,
    );
    const saved = await saveReviewVersion(
      db,
      actor,
      projectId,
      {
        publicId: `youtube:${session.videoId}`,
        provider: "youtube",
        youtubeId: session.videoId,
        mime: session.mime,
        bytes: session.bytes,
        durationMs: session.durationMs,
      },
      session.title,
      session.note,
      id,
    );
    if (!saved)
      return {
        error:
          "Project access changed or the version limit was reached. The video remains in YouTube Studio, but was not added to this project.",
      };
    await db.execute(
      sql`UPDATE project_review_uploads SET status='saved',session_uri=NULL WHERE id=${id}::uuid AND actor_key=${actor.key}`,
    );
    return {
      success:
        "Video uploaded as unlisted. YouTube may take a moment to finish processing the preview.",
      versionId: saved,
      uploadId: id,
    };
  }
  return { error: "This upload action is unavailable." };
}
export async function youtubeUploadChunk(
  args: ActionFunctionArgs,
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
): Promise<ReviewResult> {
  const url = new URL(args.request.url),
    id = url.searchParams.get("upload") || "",
    offset = Number(url.searchParams.get("offset"));
  if (
    !/^\d+$/.test(url.searchParams.get("offset") || "") ||
    !Number.isSafeInteger(offset)
  )
    return { error: "Invalid upload position." };
  const session = await getUpload(db, actor, projectId, id);
  if (!session.sessionUri || !session.channelId)
    return { error: "The upload session is not ready." };
  if (offset !== session.offset)
    return {
      error:
        "Upload progress changed. Retry to resume from the received position.",
    };
  if (
    args.request.headers.get("Content-Type") !== "application/octet-stream" ||
    !args.request.body
  )
    return { error: "Send a video chunk to continue the upload." };
  const maximum = Math.min(REVIEW_UPLOAD_CHUNK_BYTES, session.bytes - offset);
  if (maximum < 1) return { uploadId: id, offset: session.bytes };
  const reader = args.request.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximum) {
        await reader.cancel();
        return { error: "This video chunk exceeds its expected size." };
      }
      parts.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== maximum)
    return {
      error: "The video chunk was incomplete. Retry to resume the upload.",
    };
  const body = new Uint8Array(size);
  let cursor = 0;
  for (const part of parts) {
    body.set(part, cursor);
    cursor += part.byteLength;
  }
  if (offset === 0) {
    const mp4 = String.fromCharCode(...body.slice(4, 8)) === "ftyp",
      webm =
        body[0] === 0x1a &&
        body[1] === 0x45 &&
        body[2] === 0xdf &&
        body[3] === 0xa3;
    if (!(session.mime === "video/mp4" ? mp4 : webm))
      return {
        error:
          "This file does not match its video format. Export it as MP4 or WebM.",
      };
  }
  await claim(db, actor, projectId, id);
  try {
    const token = await youtubeAccessToken(db, args.context, session.channelId);
    const response = await sendYouTubeUpload(
      await decryptYouTubeSecret(session.sessionUri, args.context),
      token.accessToken,
      `bytes ${offset}-${offset + size - 1}/${session.bytes}`,
      body.buffer,
      session.mime,
    );
    return await recordResponse(db, actor, projectId, session, response);
  } finally {
    await release(db, id);
  }
}
