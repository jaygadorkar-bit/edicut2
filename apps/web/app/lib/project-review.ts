import { parseAnnotation, type FrameAnnotation } from "./review-annotations";
export type { FrameAnnotation } from "./review-annotations";
export const REVIEW_MAX_BYTES = 50 * 1024 * 1024;
export const REVIEW_VOICE_MAX_BYTES = 2 * 1024 * 1024;
export const REVIEW_VOICE_MAX_DURATION_MS = 120_000;
export type ReviewVoiceNote = {
  mime: string;
  bytes: number;
  durationMs: number;
};
export type StoredReviewVoiceNote = ReviewVoiceNote & {
  driveFileId: string;
  digest: string;
};
export const REVIEW_MAX_DURATION_MS = 6 * 60 * 60 * 1000;
export const YOUTUBE_REVIEW_MAX_BYTES = 10 * 1024 * 1024 * 1024;
export const REVIEW_UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
export type ReviewTeamMember = { id: string; name: string; role?: string };
export type ReviewEditorOption = ReviewTeamMember & {
  activeProjects?: number;
  dueSoonProjects?: number;
  overdueProjects?: number;
};
export type ReviewStorage = {
  connected: boolean;
  provider: "google_drive" | "youtube";
  channelName?: string;
  maxBytes: number;
};
export type ReviewVersion = {
  id: string;
  projectId: string;
  title: string;
  note: string;
  authorName: string;
  actorKey: string;
  durationMs: number;
  bytes: number;
  mime: string;
  provider?: "cloudinary" | "youtube" | "google_drive";
  youtubeId?: string | null;
  decision: "pending" | "approved" | "changes_requested";
  createdAt: string;
  updatedAt: string;
};
export type ReviewComment = {
  /** Client-only optimistic state; never persisted as comment metadata. */
  pending?: boolean;
  id: string;
  versionId: string;
  parentId: string | null;
  actorKey: string;
  authorName: string;
  authorRole: string;
  body: string;
  timestampMs: number | null;
  endMs: number | null;
  annotation: FrameAnnotation | null;
  voice?: ReviewVoiceNote | null;
  category: "change" | "question" | "praise";
  priority: "normal" | "high";
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ReviewProject = {
  id: string;
  ownerId: string;
  title: string;
  channelName: string;
  status: string;
  deadline: string | null;
  notes: string | null;
  updatedAt: string | Date;
  reviewRevision?: number;
};
export type ReviewActor = {
  id: string;
  key: string;
  name: string;
  role: string;
  admin: boolean;
};
export type ReviewData = {
  project: ReviewProject;
  versions: ReviewVersion[];
  comments: ReviewComment[];
  members: ReviewTeamMember[];
  editorOptions: ReviewEditorOption[];
  storage?: ReviewStorage;
  files: { id: string; fileName: string; shareUrl: string; kind: string }[];
  ready: boolean;
  canUpload: boolean;
  canDecide: boolean;
  canAssign: boolean;
  actor: ReviewActor;
  features: string[];
};
export type ReviewResult = {
  error?: string;
  success?: string;
  commentId?: string;
  versionId?: string;
  uploadId?: string;
  offset?: number;
};

export function formatReviewTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
export function parseReviewTime(value: string): number | null {
  if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim())) return null;
  const values = value.trim().split(":").map(Number);
  if (values.slice(1).some((number) => number > 59)) return null;
  const seconds = values.reduce((total, part) => total * 60 + part, 0);
  return seconds * 1000 <= REVIEW_MAX_DURATION_MS ? seconds * 1000 : null;
}
export function parseFrameAnnotation(
  value: string,
): FrameAnnotation | null | undefined {
  return parseAnnotation(value);
}

/** Versioned metadata in the existing JSONB field; legacy rectangles stay valid. */
export function encodeReviewMetadata(
  annotation: FrameAnnotation | null,
  voice?: StoredReviewVoiceNote | null,
) {
  return voice ? { format: 2, drawing: annotation, voice } : annotation;
}
export function decodeReviewMetadata(raw: unknown): {
  annotation: FrameAnnotation | null;
  voice: StoredReviewVoiceNote | null;
} {
  const value = raw as {
    format?: number;
    drawing?: unknown;
    voice?: StoredReviewVoiceNote;
  } | null;
  if (value?.format !== 2)
    return {
      annotation: parseAnnotation(raw ? JSON.stringify(raw) : "") ?? null,
      voice: null,
    };
  const voice = value.voice;
  const valid =
    voice &&
    typeof voice.driveFileId === "string" &&
    typeof voice.digest === "string" &&
    /^[A-Za-z0-9_-]{10,240}$/.test(voice.driveFileId) &&
    /^[a-f0-9]{64}$/.test(voice.digest) &&
    ["audio/webm", "audio/ogg", "audio/mp4"].includes(voice.mime) &&
    Number.isSafeInteger(voice.bytes) &&
    voice.bytes >= 16 &&
    voice.bytes <= REVIEW_VOICE_MAX_BYTES &&
    Number.isSafeInteger(voice.durationMs) &&
    voice.durationMs > 0 &&
    voice.durationMs <= REVIEW_VOICE_MAX_DURATION_MS;
  return {
    annotation:
      parseAnnotation(value.drawing ? JSON.stringify(value.drawing) : "") ??
      null,
    voice: valid ? voice : null,
  };
}
export function validateReviewComment(form: FormData, durationMs: number) {
  const body = String(form.get("body") ?? "").trim();
  const number = (key: string) => {
    const raw = String(form.get(key) ?? "");
    return raw === ""
      ? null
      : /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))
        ? Number(raw)
        : NaN;
  };
  const timestampMs = number("timestampMs"),
    endMs = number("endMs");
  const annotation = parseFrameAnnotation(String(form.get("annotation") ?? ""));
  const category = String(form.get("category") ?? "change"),
    priority = String(form.get("priority") ?? "normal");
  if (!body || body.length > 4000)
    return { error: "Write a comment between 1 and 4,000 characters." };
  if (annotation === undefined || (annotation && timestampMs === null))
    return { error: "Mark a frame and timestamp before adding an annotation." };
  if (
    (timestampMs !== null &&
      (!Number.isFinite(timestampMs) ||
        timestampMs < 0 ||
        timestampMs > durationMs)) ||
    (endMs !== null &&
      (timestampMs === null ||
        !Number.isFinite(endMs) ||
        endMs < timestampMs ||
        endMs > durationMs))
  )
    return { error: "Choose a timestamp or range within this video." };
  if (
    !["change", "question", "praise"].includes(category) ||
    !["normal", "high"].includes(priority)
  )
    return { error: "Choose a valid comment type and priority." };
  return {
    value: { body, timestampMs, endMs, annotation, category, priority },
  };
}
export const projectStatusLabel = (status: string) =>
  ({
    intake: "Brief received",
    editing: "In editing",
    review: "Ready for review",
    client_review: "Ready for review",
    revision: "Changes requested",
    delivered: "Delivered",
  })[status] || status.replaceAll("_", " ");
export function projectBriefSections(notes: string | null) {
  const labels: Record<string, string> = {
    "Creator profile": "Creator",
    "Brand assets": "Brand assets",
    Goal: "Your video",
    Format: "Video format",
    "Finished runtime": "Finished length",
    "Target date": "Preferred delivery",
    Footage: "Footage folder",
    Script: "Script or outline",
    "Project reference": "Example video",
    Captions: "Captions",
    "Editing instructions": "Editing notes",
  };
  return (notes || "No brief was recorded for this older project.")
    .split(/\n\s*\n/)
    .filter((block) => !/^Purchase:\s*[0-9a-f-]{36}\s*$/i.test(block.trim()))
    .map((block) => {
      const match = block.match(/^([^:\n]{1,64}):[ \t]*([\s\S]*)$/);
      return match
        ? { label: labels[match[1]] || match[1], value: match[2].trim() }
        : { label: "Notes", value: block.trim() };
    });
}
export function reviewCsv(comments: ReviewComment[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    const safe = /^\s*[=+@-]|^[\t\r\n]/.test(text) ? "'" + text : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [
    [
      "Time",
      "End",
      "Type",
      "Priority",
      "Status",
      "Author",
      "Comment",
      "Parent comment",
    ],
    ...comments.map((comment) => [
      comment.timestampMs === null
        ? "General"
        : formatReviewTime(comment.timestampMs),
      comment.endMs === null ? "" : formatReviewTime(comment.endMs),
      comment.category,
      comment.priority,
      comment.resolved ? "Resolved" : "Open",
      comment.authorName,
      comment.body,
      comment.parentId ?? "",
    ]),
  ]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
