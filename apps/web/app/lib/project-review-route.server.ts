import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { sql } from "drizzle-orm";
import {
  forbiddenMutation,
  isSameSiteMutation,
  readMutationForm,
} from "./mutation-request.server";
import { consumeUsageLimit } from "./usage-protection.server";
import { isWorkspaceRecordId } from "./workspace";
import {
  REVIEW_MAX_BYTES,
  REVIEW_MAX_DURATION_MS,
  YOUTUBE_REVIEW_MAX_BYTES,
  type ReviewStorage,
  type ReviewResult,
} from "./project-review";
import {
  findReviewProject,
  isMissingReviewSchema,
  loadProjectReview,
  mutateProjectReview,
  projectReviewAccessSql,
  requireReviewActor,
  reviewRows,
  saveReviewVersion,
} from "./project-review.server";
import {
  deleteReviewVideo,
  reviewMediaId,
  streamReviewVideo,
  streamGoogleDriveReviewVideo,
  uploadReviewVideo,
} from "./project-review-media.server";
import { getYouTubeStorageStatus } from "./youtube-storage.server";
import { youtubeUploadChunk, youtubeUploadForm } from "./youtube-review-upload.server";
import { getGoogleDriveStorageStatus, GOOGLE_DRIVE_REVIEW_MAX_BYTES } from "./google-drive-storage.server";
import { googleDriveUploadChunk, googleDriveUploadForm } from "./google-drive-review-upload.server";

async function reviewUploadProvider(db: Awaited<ReturnType<typeof requireReviewActor>>["db"], actor: Awaited<ReturnType<typeof requireReviewActor>>["actor"], projectId: string, id: string) {
  if (!isWorkspaceRecordId(id)) throw new Response("Upload not found.", { status: 404 });
  const row = reviewRows<{ provider: string }>(await db.execute(sql`SELECT s.provider FROM project_review_uploads s JOIN workspace_projects p ON p.id=s.project_id WHERE p.id=${projectId}::uuid AND s.id=${id}::uuid AND s.actor_key=${actor.key} AND s.expires_at>now() AND ${projectReviewAccessSql(actor, "upload")}`))[0];
  if (!row || !["youtube", "google_drive"].includes(row.provider)) throw new Response("Upload not found.", { status: 404 });
  return row.provider;
}

export async function projectReviewLoader(
  args: LoaderFunctionArgs,
  admin: boolean,
) {
  const { db, actor, features } = await requireReviewActor(args, admin);
  const projectId = args.params.projectId ?? "";
  const url = new URL(args.request.url);
  try {
    if (url.searchParams.get("media")) {
      const limit = await consumeUsageLimit({
        ...args,
        bindingName: "USER_ACTION_LIMITER",
        key: `review-media:${actor.key}`,
        localLimit: 120,
        localPeriodSeconds: 60,
      });
      if (limit !== "allowed")
        throw new Response("Please wait a minute before reloading the video.", {
          status: 429,
        });
      const versionId = url.searchParams.get("media")!;
      if (!isWorkspaceRecordId(projectId) || !isWorkspaceRecordId(versionId))
        throw new Response("Video not found.", { status: 404 });
      const media = reviewRows<{
        provider: string;
        publicId: string;
        driveFileId: string | null;
        mime: string;
        bytes: number;
      }>(
        await db.execute(
          sql`SELECT v.provider,v.public_id AS "publicId",v.drive_file_id AS "driveFileId",v.mime,v.bytes::double precision AS bytes FROM project_review_versions v JOIN workspace_projects p ON p.id=v.project_id WHERE p.id=${projectId}::uuid AND v.id=${versionId}::uuid AND v.provider IN ('cloudinary','google_drive') AND ${projectReviewAccessSql(actor)}`,
        ),
      )[0];
      if (!media) throw new Response("Video not found.", { status: 404 });
      if (media.provider === "google_drive") {
        if (!media.driveFileId) throw new Response("Video not found.", { status: 404 });
        return streamGoogleDriveReviewVideo({ driveFileId: media.driveFileId, mime: media.mime, bytes: media.bytes }, args.request, db, args.context);
      }
      return streamReviewVideo(media, args.request, args.context);
    }
    const data = await loadProjectReview(
      db,
      actor,
      projectId,
      features,
      url.searchParams.get("version"),
    );
    if (!data.ready) return data;
    const [drive, youtube] = await Promise.all([getGoogleDriveStorageStatus(db), getYouTubeStorageStatus(db)]);
    const provider: ReviewStorage["provider"] = drive.connected || !youtube.connected ? "google_drive" : "youtube";
    const active = provider === "google_drive" ? drive : youtube;
    return { ...data, storage: { connected: active.connected, provider, channelName: active.channelName, maxBytes: provider === "google_drive" ? GOOGLE_DRIVE_REVIEW_MAX_BYTES : YOUTUBE_REVIEW_MAX_BYTES } };
  } catch (error) {
    if (isMissingReviewSchema(error))
      throw new Response(
        "Video review is being prepared. Please try again later.",
        { status: 503 },
      );
    throw error;
  }
}
export async function projectReviewAction(
  args: ActionFunctionArgs,
  admin: boolean,
): Promise<ReviewResult | Response> {
  if (!isSameSiteMutation(args.request)) return forbiddenMutation();
  const { db, actor } = await requireReviewActor(args, admin);
  const projectId = args.params.projectId ?? "";
  const multipart = args.request.headers
    .get("Content-Type")
    ?.startsWith("multipart/form-data");
  const chunk = new URL(args.request.url).searchParams.has("upload");
  const limit = await consumeUsageLimit({
    ...args,
    bindingName: multipart ? "ADMIN_MULTIPART_LIMITER" : chunk ? "REVIEW_UPLOAD_LIMITER" : "USER_ACTION_LIMITER",
    key: `review:${actor.key}`,
    localLimit: multipart ? 5 : chunk ? 240 : 60,
    localPeriodSeconds: 60,
  });
  if (limit !== "allowed")
    return { error: "Please wait a minute before trying again." };
  try {
    const project = await findReviewProject(db, actor, projectId);
    if (chunk) {
      if (!actor.admin && !["editor","project_manager"].includes(actor.role)) throw new Response("Only the assigned team can upload videos.",{status:403});
      const provider = await reviewUploadProvider(db, actor, projectId, new URL(args.request.url).searchParams.get("upload") || "");
      return provider === "google_drive" ? await googleDriveUploadChunk(args,db,actor,projectId) : await youtubeUploadChunk(args,db,actor,projectId);
    }
    if (
      multipart &&
      !actor.admin &&
      !["editor", "project_manager"].includes(actor.role)
    )
      throw new Response("Only the project editor can upload video versions.", {
        status: 403,
      });
    const form = await readMutationForm(
      args.request,
      multipart ? REVIEW_MAX_BYTES + 64 * 1024 : 64 * 1024,
    );
    if (!form)
      return {
        error: "This form could not be read or exceeds the upload limit.",
      };
    const uploadIntent = String(form.get("intent"));
    if (uploadIntent === "init-video-upload") return form.get("provider") === "google_drive" ? await googleDriveUploadForm(args,db,actor,projectId,form) : await youtubeUploadForm(args,db,actor,projectId,form);
    if (["status-video-upload","finish-video-upload"].includes(uploadIntent)) {
      const provider = await reviewUploadProvider(db, actor, projectId, String(form.get("uploadId") || ""));
      return provider === "google_drive" ? await googleDriveUploadForm(args,db,actor,projectId,form) : await youtubeUploadForm(args,db,actor,projectId,form);
    }
    if (form.get("intent") !== "upload-version")
      return await mutateProjectReview(db, actor, project.id, form);
    if (!actor.admin && !["editor", "project_manager"].includes(actor.role))
      throw new Response("Only the project editor can upload video versions.", {
        status: 403,
      });
    const title = String(form.get("title") ?? "").trim(),
      note = String(form.get("note") ?? "").trim(),
      versionId = String(form.get("uploadId") ?? "");
    const durationMs = Number(form.get("durationMs"));
    const file = form.get("video");
    if (
      !title ||
      title.length > 160 ||
      note.length > 2000 ||
      !isWorkspaceRecordId(versionId) ||
      !Number.isSafeInteger(durationMs) ||
      durationMs < 1 ||
      durationMs > REVIEW_MAX_DURATION_MS ||
      !(file instanceof File)
    )
      return {
        error:
          "Add a video title and a playable MP4 or WebM video up to six hours long.",
      };
    const existing = reviewRows<{ id: string }>(
      await db.execute(
        sql`SELECT v.id FROM project_review_versions v JOIN workspace_projects p ON p.id=v.project_id WHERE p.id=${projectId}::uuid AND v.id=${versionId}::uuid AND v.actor_key=${actor.key} AND ${projectReviewAccessSql(actor, "upload")}`,
      ),
    );
    if (existing.length)
      return { success: "Video version uploaded.", versionId };
    // Verify storage tables and permission before transferring the file.
    await db.execute(
      sql`SELECT id FROM project_review_versions WHERE project_id=${projectId}::uuid LIMIT 1`,
    );
    const publicId = reviewMediaId(projectId, versionId, file.type);
    let uploaded = false;
    let saveStarted = false;
    try {
      await uploadReviewVideo(file, publicId, args.context);
      uploaded = true;
      saveStarted = true;
      const savedId = await saveReviewVersion(
        db,
        actor,
        projectId,
        { publicId, bytes: file.size, mime: file.type, durationMs },
        title,
        note,
        versionId,
      );
      if (!savedId) {
        saveStarted = false;
        return {
          error:
            "Project access changed or the 100-version limit was reached. Your video was not added.",
        };
      }
      uploaded = false; // The committed record now owns this private asset.
      return {
        success: "Video version uploaded. Your client can review it now.",
        versionId: savedId,
      };
    } finally {
      // An interrupted DB response may still have committed: never delete a possibly owned asset.
      if (uploaded && !saveStarted)
        await deleteReviewVideo(publicId, args.context).catch(() => {
          console.error("A private review upload needs orphan cleanup.");
        });
    }
  } catch (error) {
    if (isMissingReviewSchema(error))
      return {
        error:
          "Video review setup is being prepared. Your changes have not been saved. Please try again later.",
      };
    if (error instanceof Response) {
      if ([400,409,502,503].includes(error.status))
        return { error: await error.text() };
      throw error;
    }
    // Never include driver SQL or provider diagnostics in client-facing errors.
    return {
      error:
        "Your change could not be confirmed. Your draft is still here; refresh the feedback and retry.",
    };
  }
}
