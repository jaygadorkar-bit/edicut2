import { sql } from "drizzle-orm";
import type { DatabaseClient } from "@edicut/db/client";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  beginGoogleDriveUpload,
  googleDriveAccessToken,
  safeGoogleDriveFileId,
  sendGoogleDriveUpload,
  verifyGoogleDriveFile,
} from "./google-drive-storage.server";
import {
  decodeReviewMetadata,
  REVIEW_VOICE_MAX_BYTES,
  REVIEW_VOICE_MAX_DURATION_MS,
  validateReviewComment,
  type ReviewActor,
  type ReviewResult,
  type StoredReviewVoiceNote,
} from "./project-review";
import {
  mutateProjectReview,
  projectReviewAccessSql,
  reviewRows,
} from "./project-review.server";
import { streamGoogleDriveReviewVideo } from "./project-review-media.server";
import { isWorkspaceRecordId } from "./workspace";

export async function validateReviewVoice(
  file: File,
  durationMs: number,
): Promise<string | null> {
  if (
    !["audio/webm", "audio/ogg", "audio/mp4"].includes(file.type) ||
    file.size < 16 ||
    file.size > REVIEW_VOICE_MAX_BYTES ||
    !Number.isSafeInteger(durationMs) ||
    durationMs < 1 ||
    durationMs > REVIEW_VOICE_MAX_DURATION_MS
  )
    return "Record a voice instruction up to two minutes and 2 MB.";
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const signature =
    file.type === "audio/webm"
      ? bytes[0] === 0x1a &&
        bytes[1] === 0x45 &&
        bytes[2] === 0xdf &&
        bytes[3] === 0xa3
      : file.type === "audio/ogg"
        ? String.fromCharCode(...bytes.slice(0, 4)) === "OggS"
        : String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  return signature
    ? null
    : "The recording format does not match its audio file. Record it again.";
}

export async function addReviewVoiceComment(
  args: ActionFunctionArgs,
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
  form: FormData,
): Promise<ReviewResult> {
  const file = form.get("voice"),
    durationMs = Number(form.get("voiceDurationMs")),
    commentId = String(form.get("commentId") ?? ""),
    versionId = String(form.get("versionId") ?? "");
  if (
    !(file instanceof File) ||
    !isWorkspaceRecordId(commentId) ||
    !isWorkspaceRecordId(versionId) ||
    form.get("parentId")
  )
    return {
      error: "Record your instruction on a new comment before posting.",
    };
  const invalid = await validateReviewVoice(file, durationMs);
  if (invalid) return { error: invalid };
  const version = reviewRows<{ durationMs: number; decision: string }>(
    await db.execute(
      sql`SELECT v.duration_ms AS "durationMs",v.decision FROM project_review_versions v JOIN workspace_projects p ON p.id=v.project_id WHERE p.id=${projectId}::uuid AND v.id=${versionId}::uuid AND ${projectReviewAccessSql(actor)}`,
    ),
  )[0];
  if (!version) throw new Response("Video version not found.", { status: 404 });
  const parsed = validateReviewComment(form, version.durationMs);
  if (!parsed.value) return { error: parsed.error };
  const buffer = await file.arrayBuffer();
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const existing = reviewRows<{ annotation: unknown }>(
    await db.execute(
      sql`SELECT c.annotation FROM project_review_comments c JOIN project_review_versions v ON v.id=c.version_id JOIN workspace_projects p ON p.id=v.project_id WHERE c.id=${commentId}::uuid AND v.id=${versionId}::uuid AND p.id=${projectId}::uuid AND c.actor_key=${actor.key} AND ${projectReviewAccessSql(actor)}`,
    ),
  )[0];
  if (existing) {
    const voice = decodeReviewMetadata(existing.annotation).voice;
    if (!voice || voice.digest !== digest || voice.durationMs !== durationMs)
      return {
        error:
          "This comment already has a different recording. Start a new comment.",
      };
    return mutateProjectReview(db, actor, projectId, form, voice);
  }
  if (version.decision === "approved")
    return { error: "This version is approved. Its feedback is read-only." };
  const token = await googleDriveAccessToken(db, args.context);
  const extension =
    file.type === "audio/mp4"
      ? "m4a"
      : file.type === "audio/ogg"
        ? "ogg"
        : "webm";
  const session = await beginGoogleDriveUpload(
    token,
    file.size,
    file.type,
    `EdiCut voice instruction - ${commentId}.${extension}`,
  );
  const response = await sendGoogleDriveUpload(
    session,
    token,
    `bytes 0-${file.size - 1}/${file.size}`,
    buffer,
    file.type,
  );
  if (!response.ok)
    throw new Response(
      "The voice instruction could not be uploaded. Your recording is still in the draft.",
      { status: 502 },
    );
  const uploaded = (await response.json()) as { id?: string };
  if (!safeGoogleDriveFileId(uploaded.id))
    throw new Response("The recording upload could not be confirmed.", {
      status: 502,
    });
  const voice: StoredReviewVoiceNote = {
    driveFileId: uploaded.id,
    mime: file.type,
    bytes: file.size,
    durationMs,
    digest,
  };
  let saveStarted = false,
    committed = false;
  try {
    await verifyGoogleDriveFile(uploaded.id, file.size, file.type, token);
    saveStarted = true;
    const result = await mutateProjectReview(db, actor, projectId, form, voice);
    if (result.error) saveStarted = false;
    else committed = true;
    return result;
  } finally {
    // Never delete a possibly committed asset after an ambiguous DB interruption.
    if (!committed && !saveStarted)
      try {
        const removed = await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(voice.driveFileId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!removed.ok && removed.status !== 404)
          throw new Error("Cleanup unavailable");
      } catch {
        console.error("A private review voice upload needs orphan cleanup.");
      }
  }
}

export async function streamReviewVoice(
  args: LoaderFunctionArgs,
  db: DatabaseClient,
  actor: ReviewActor,
  projectId: string,
  commentId: string,
) {
  if (!isWorkspaceRecordId(projectId) || !isWorkspaceRecordId(commentId))
    throw new Response("Voice instruction not found.", { status: 404 });
  const comment = reviewRows<{ annotation: unknown }>(
    await db.execute(
      sql`SELECT c.annotation FROM project_review_comments c JOIN project_review_versions v ON v.id=c.version_id JOIN workspace_projects p ON p.id=v.project_id WHERE p.id=${projectId}::uuid AND c.id=${commentId}::uuid AND ${projectReviewAccessSql(actor)}`,
    ),
  )[0];
  const voice = decodeReviewMetadata(comment?.annotation).voice;
  if (!voice)
    throw new Response("Voice instruction not found.", { status: 404 });
  return streamGoogleDriveReviewVideo(voice, args.request, db, args.context);
}
