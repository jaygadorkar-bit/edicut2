import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUp,
  Check,
  CheckCheck,
  Clock3,
  MoreHorizontal,
  MessageCircle,
  Send,
  SquareDashed,
  X,
} from "lucide-react";
import type { MouseEvent } from "react";
import {
  ReviewVoiceRecorder,
  type ReviewVoiceDraft,
} from "./ReviewVoiceRecorder";
import {
  formatReviewTime,
  type FrameAnnotation,
  type ReviewComment,
  type ReviewResult,
  type ReviewVersion,
} from "../lib/project-review";

export type ReviewSubmit = (
  form: FormData,
  onProgress?: (percent: number) => void,
) => Promise<ReviewResult>;
export function ReviewFeedback({
  version,
  versionSelector,
  comments,
  actorKey,
  onSubmit,
  onSeek,
  getTime,
  anchor,
  setAnchor,
  rangeEnd,
  setRangeEnd,
  selectedComment,
  selectedCommentKey,
  annotation,
  setAnnotation,
  composerRef,
  busy,
  onDraftChange,
  onPause,
  draftBody,
  setDraftBody,
  voiceUrl,
  voiceAvailable,
  active,
}: {
  version: ReviewVersion;
  versionSelector: ReactNode;
  comments: ReviewComment[];
  actorKey: string;
  onSubmit: ReviewSubmit;
  onSeek: (milliseconds: number, annotation?: FrameAnnotation | null) => void;
  getTime: () => number;
  anchor: number | null;
  setAnchor: (value: number | null) => void;
  rangeEnd: number | null;
  setRangeEnd: (value: number | null) => void;
  selectedComment: string | null;
  selectedCommentKey: number;
  annotation: FrameAnnotation | null;
  setAnnotation: (value: FrameAnnotation | null) => void;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  busy: boolean;
  onDraftChange: (value: boolean) => void;
  onPause: () => void;
  draftBody: string;
  setDraftBody: (value: string) => void;
  voiceUrl: (commentId: string) => string;
  voiceAvailable: boolean;
  active: boolean;
}) {
  const body = draftBody,
    setBody = setDraftBody;
  const [voice, setVoice] = useState<ReviewVoiceDraft | null>(null),
    [recording, setRecording] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null),
    [reply, setReply] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null),
    [editBody, setEditBody] = useState("");
  const token = useRef<string | null>(null),
    replyToken = useRef<string | null>(null);
  const payload = useRef("");
  const replyPayload = useRef("");
  const submitting = useRef(false);
  const [localError, setLocalError] = useState("");
  const { visible, replies } = useMemo(() => {
    const roots: ReviewComment[] = [];
    const replies = new Map<string, ReviewComment[]>();
    for (const comment of comments) {
      if (!comment.parentId) roots.push(comment);
      else {
        const thread = replies.get(comment.parentId) ?? [];
        thread.push(comment);
        replies.set(comment.parentId, thread);
      }
    }
    roots.sort(
      (a, b) =>
        (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return { visible: roots, replies };
  }, [comments]);
  useEffect(() => {
    if (selectedComment) {
      const comment = document.getElementById(`comment-${selectedComment}`);
      comment?.focus({ preventScroll: true });
      comment?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedComment, selectedCommentKey]);
  useEffect(() => {
    onDraftChange(
      Boolean(
        body.trim() ||
          reply.trim() ||
          annotation ||
          rangeEnd !== null ||
          voice ||
          recording ||
          editBody.trim(),
      ),
    );
    return () => onDraftChange(false);
  }, [
    body,
    reply,
    annotation,
    rangeEnd,
    voice,
    recording,
    editBody,
    onDraftChange,
  ]);
  async function addComment() {
    if (busy || submitting.current) return;
    setLocalError("");
    if (recording) {
      setLocalError("Stop the recording before posting your instruction.");
      return;
    }
    if (!body.trim() && !voice) {
      setLocalError("Write your feedback before posting.");
      composerRef.current?.focus();
      return;
    }
    if (rangeEnd !== null && (anchor === null || rangeEnd < anchor)) {
      setLocalError("The end of a range must be after its start.");
      return;
    }
    const form = new FormData();
    const nextPayload = JSON.stringify({
      body,
      anchor,
      rangeEnd,
      annotation,
      category: "change",
      priority: "normal",
      voice: voice
        ? [voice.file.name, voice.file.size, voice.durationMs]
        : null,
    });
    if (payload.current !== nextPayload || !token.current) {
      token.current = crypto.randomUUID();
      payload.current = nextPayload;
    }
    Object.entries({
      intent: "add-comment",
      versionId: version.id,
      commentId: token.current,
      body: body.trim() || "Voice instruction",
      timestampMs: anchor === null ? "" : String(anchor),
      endMs: rangeEnd === null ? "" : String(rangeEnd),
      annotation: annotation ? JSON.stringify(annotation) : "",
      category: "change",
      priority: "normal",
    }).forEach(([key, value]) => form.set(key, value));
    if (voice) {
      form.set("voice", voice.file);
      form.set("voiceDurationMs", String(voice.durationMs));
    }
    submitting.current = true;
    let result: ReviewResult;
    try {
      result = await onSubmit(form);
    } finally {
      submitting.current = false;
    }
    if (!result.error) {
      setBody("");
      setAnchor(null);
      setRangeEnd(null);
      setAnnotation(null);
      setVoice(null);
      token.current = null;
    }
  }
  async function addReply(commentId: string) {
    if (busy || !reply.trim()) return;
    const nextPayload = JSON.stringify([commentId, reply.trim()]);
    if (replyPayload.current !== nextPayload || !replyToken.current) {
      replyToken.current = crypto.randomUUID();
      replyPayload.current = nextPayload;
    }
    const form = new FormData();
    Object.entries({
      intent: "add-comment",
      versionId: version.id,
      parentId: commentId,
      commentId: replyToken.current,
      body: reply,
      category: "question",
      priority: "normal",
    }).forEach(([key, value]) => form.set(key, value));
    const result = await onSubmit(form);
    if (!result.error) {
      setReply("");
      setReplyTo(null);
      replyToken.current = null;
    }
  }
  function closeCommentMenu(event: MouseEvent<HTMLButtonElement>) {
    const actions = event.currentTarget.closest("details");
    actions?.querySelector("summary")?.focus();
    actions?.removeAttribute("open");
  }
  async function saveComment(commentId: string) {
    const nextBody = editBody.trim();
    if (!nextBody || nextBody.length > 4000) {
      setLocalError("Keep a comment between 1 and 4,000 characters.");
      return;
    }
    setLocalError("");
    const form = new FormData();
    Object.entries({
      intent: "edit-comment",
      versionId: version.id,
      commentId,
      body: nextBody,
    }).forEach(([key, value]) => form.set(key, value));
    const result = await onSubmit(form);
    if (!result.error) {
      setEditingCommentId(null);
      setEditBody("");
    } else setLocalError(result.error);
  }
  async function deleteComment(comment: ReviewComment) {
    if (
      !window.confirm(
        "Delete this comment and its replies? This cannot be undone.",
      )
    )
      return;
    const form = new FormData();
    Object.entries({
      intent: "delete-comment",
      versionId: version.id,
      commentId: comment.id,
    }).forEach(([key, value]) => form.set(key, value));
    const result = await onSubmit(form);
    if (result.error) setLocalError(result.error);
  }
  async function toggleResolved(comment: ReviewComment) {
    const form = new FormData();
    Object.entries({
      intent: "resolve-comment",
      versionId: version.id,
      commentId: comment.id,
      expectedResolved: String(comment.resolved),
    }).forEach(([key, value]) => form.set(key, value));
    const result = await onSubmit(form);
    if (result.error) setLocalError(result.error);
  }
  return (
    <section className="review-feedback" aria-label="Version feedback">
      <div className="review-feedback__version">{versionSelector}</div>
      <div className="review-feedback__threads">
        <div className="review-feedback__heading">
          <div>
            <h2>Feedback</h2>
          </div>
        </div>
        <div className="review-feedback__list" aria-label="Feedback">
          {visible.length ? (
            visible.map((comment) => (
              <article
                key={comment.id}
                id={`comment-${comment.id}`}
                className={`review-comment ${comment.resolved ? "is-resolved" : ""}`}
                tabIndex={-1}
              >
                <div className="review-comment__heading">
                  <span className="review-avatar" aria-hidden="true">
                    {comment.authorName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="review-comment__author">
                    <strong>{comment.authorName}</strong>
                    <span>
                      {comment.authorRole === "admin"
                        ? "EdiCut team"
                        : comment.authorRole === "customer" ||
                            comment.authorRole === "user"
                          ? "Client"
                          : comment.authorRole.replaceAll("_", " ")}
                    </span>
                  </div>
                  {comment.timestampMs !== null ? (
                    <button
                      type="button"
                      className="review-time-chip review-comment__time"
                      onClick={() =>
                        onSeek(comment.timestampMs!, comment.annotation)
                      }
                      aria-label={`Go to ${formatReviewTime(comment.timestampMs)}`}
                    >
                      <Clock3 size={12} aria-hidden="true" />
                      {formatReviewTime(comment.timestampMs)}
                      {comment.endMs !== null
                        ? `–${formatReviewTime(comment.endMs)}`
                        : ""}
                      {comment.annotation ? (
                        <SquareDashed
                          size={12}
                          aria-label="Includes frame annotation"
                        />
                      ) : null}
                    </button>
                  ) : null}
                  {comment.pending ? (
                    <span className="review-comment__saving" role="status">
                      Saving…
                    </span>
                  ) : null}
                  {version.decision !== "approved" && !comment.pending ? (
                    <details
                      className="review-comment__actions"
                      onToggle={(event) => {
                        const actions = event.currentTarget,
                          menu = actions.querySelector<HTMLElement>(
                            ".review-comment__menu",
                          ),
                          scrollArea = actions.closest(
                            ".review-feedback__threads",
                          );
                        if (!actions.open || !menu || !scrollArea) {
                          actions.removeAttribute("data-placement");
                          return;
                        }
                        const menuBounds = menu.getBoundingClientRect(),
                          areaBounds = scrollArea.getBoundingClientRect();
                        actions.dataset.placement =
                          menuBounds.bottom > areaBounds.bottom
                            ? "top"
                            : "bottom";
                      }}
                      onBlur={(event) => {
                        if (
                          !event.currentTarget.contains(
                            event.relatedTarget as Node | null,
                          )
                        )
                          event.currentTarget.removeAttribute("open");
                      }}
                      onKeyDown={(event) => {
                        const menuItems = Array.from(
                          event.currentTarget.querySelectorAll<HTMLButtonElement>(
                            '[role="menuitem"]:not(:disabled)',
                          ),
                        );
                        if (event.key === "Escape") {
                          event.preventDefault();
                          event.currentTarget.removeAttribute("open");
                          event.currentTarget.querySelector("summary")?.focus();
                          return;
                        }
                        if (
                          ["ArrowDown", "ArrowUp", "Home", "End"].includes(
                            event.key,
                          )
                        ) {
                          event.preventDefault();
                          const activeIndex = menuItems.indexOf(
                            document.activeElement as HTMLButtonElement,
                          );
                          const nextIndex =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? menuItems.length - 1
                                : event.key === "ArrowUp"
                                  ? activeIndex <= 0
                                    ? menuItems.length - 1
                                    : activeIndex - 1
                                  : (activeIndex + 1) % menuItems.length;
                          event.currentTarget.open = true;
                          menuItems[nextIndex]?.focus();
                        }
                      }}
                    >
                      <summary
                        className="review-icon-button review-comment__menu-trigger"
                        aria-label={`More actions for ${comment.authorName}'s comment`}
                        title="Comment actions"
                      >
                        <MoreHorizontal size={18} aria-hidden="true" />
                      </summary>
                      <div
                        className="review-comment__menu"
                        role="menu"
                        aria-label="Comment actions"
                      >
                        {comment.actorKey === actorKey ? (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              disabled={busy}
                              onClick={(event) => {
                                closeCommentMenu(event);
                                setEditingCommentId(comment.id);
                                setEditBody(comment.body);
                                setLocalError("");
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="is-destructive"
                              disabled={busy}
                              onClick={(event) => {
                                closeCommentMenu(event);
                                void deleteComment(comment);
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                        <button
                          type="button"
                          role="menuitem"
                          disabled={busy}
                          onClick={(event) => {
                            closeCommentMenu(event);
                            void toggleResolved(comment);
                          }}
                        >
                          {comment.resolved ? "Reopen" : "Mark as resolved"}
                        </button>
                      </div>
                    </details>
                  ) : null}
                </div>
                <div className="review-comment__tags">
                  {comment.timestampMs === null ? (
                    <span className="review-comment__general">General</span>
                  ) : null}
                  {comment.priority === "high" ? (
                    <span className="review-priority">High priority</span>
                  ) : null}
                </div>
                {editingCommentId === comment.id ? (
                  <form
                    className="review-comment__edit-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveComment(comment.id);
                    }}
                  >
                    <label className="sr-only" htmlFor={`edit-${comment.id}`}>
                      Edit comment
                    </label>
                    <textarea
                      id={`edit-${comment.id}`}
                      className="review-field"
                      rows={3}
                      required
                      maxLength={4000}
                      value={editBody}
                      readOnly={busy}
                      onChange={(event) => setEditBody(event.target.value)}
                    />
                    <div>
                      <button
                        type="button"
                        className="review-button review-button--quiet"
                        disabled={busy}
                        onClick={() => {
                          setEditingCommentId(null);
                          setEditBody("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="review-button"
                        disabled={busy || !editBody.trim()}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="review-comment__body">{comment.body}</p>
                )}
                {comment.voice ? (
                  <audio
                    className="review-comment__voice"
                    controls
                    preload="none"
                    src={voiceUrl(comment.id)}
                    aria-label={`Voice instruction from ${comment.authorName}`}
                    onPlay={onPause}
                  />
                ) : null}
                {(replies.get(comment.id) ?? []).map((reply) => (
                  <div className="review-reply" key={reply.id}>
                    <strong>{reply.authorName}</strong>
                    <p>{reply.body}</p>
                    {reply.pending ? (
                      <span className="review-comment__saving" role="status">
                        Saving…
                      </span>
                    ) : null}
                  </div>
                ))}
                {version.decision !== "approved" ? (
                  replyTo === comment.id ? (
                    <form
                      className="review-reply-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void addReply(comment.id);
                      }}
                    >
                      <label
                        className="sr-only"
                        htmlFor={`reply-${comment.id}`}
                      >
                        Reply to {comment.authorName}
                      </label>
                      <textarea
                        id={`reply-${comment.id}`}
                        className="review-field"
                        autoFocus
                        rows={2}
                        required
                        maxLength={4000}
                        value={reply}
                        readOnly={busy}
                        onChange={(event) => {
                          setReply(event.target.value);
                          replyToken.current = null;
                        }}
                        placeholder="Reply to this thread…"
                      />
                      <div>
                        <button
                          type="button"
                          className="review-button review-button--quiet"
                          onClick={() => {
                            setReplyTo(null);
                            setReply("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="review-button"
                          disabled={busy || !reply.trim()}
                        >
                          <Send size={14} />
                          Reply
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="review-comment__reply-button"
                      onClick={() => {
                        setReplyTo(comment.id);
                        setReply("");
                        replyToken.current = null;
                      }}
                    >
                      <MessageCircle size={14} />
                      Reply
                    </button>
                  )
                ) : null}
              </article>
            ))
          ) : (
            <div className="review-feedback__empty">
              <h3>No feedback yet</h3>
              <p>Comments added to this version will appear here.</p>
            </div>
          )}
        </div>
      </div>
      <div className="review-feedback__compose">
        {version.decision === "approved" ? (
          <div className="review-feedback__approved">
            <CheckCheck size={20} />
            <p>
              This version is approved. Feedback is preserved for reference.
            </p>
          </div>
        ) : (
          <form
            className="review-composer"
            onSubmit={(event) => {
              event.preventDefault();
              void addComment();
            }}
          >
            {annotation || anchor !== null ? (
              <div className="review-composer__anchor">
                {annotation ? (
                  <button
                    type="button"
                    className="review-time-chip"
                    onClick={() => setAnnotation(null)}
                  >
                    <SquareDashed size={13} />
                    Frame area
                    <X size={12} />
                  </button>
                ) : null}
                {anchor !== null ? (
                  <button
                    type="button"
                    className="review-composer__range"
                    onClick={() => {
                      const time = getTime();
                      if (time < anchor) {
                        setLocalError(
                          "Move the player after the start time to set a range end.",
                        );
                        return;
                      }
                      setRangeEnd(time);
                    }}
                  >
                    End{" "}
                    {rangeEnd === null
                      ? "at playhead"
                      : formatReviewTime(rangeEnd)}
                  </button>
                ) : null}
              </div>
            ) : null}
            <label
              className="review-composer__label"
              htmlFor="review-comment-body"
            >
              Add a revision note
            </label>
            <textarea
              ref={composerRef}
              id="review-comment-body"
              onFocus={onPause}
              rows={1}
              maxLength={4000}
              required={!voice}
              readOnly={busy}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                token.current = null;
                setLocalError("");
              }}
              onKeyDown={(event) => {
                if (
                  (event.ctrlKey || event.metaKey) &&
                  event.key === "Enter" &&
                  !busy
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Add a revision note"
            />
            {localError ? (
              <p className="review-error" role="alert">
                {localError}
              </p>
            ) : null}
            <div className="review-composer__footer">
              <button
                type="button"
                className={`review-time-chip ${anchor === null ? "is-general" : ""}`}
                aria-label={
                  anchor === null
                    ? "Attach current playback time"
                    : "Remove timestamp"
                }
                onClick={() => {
                  setAnchor(anchor === null ? getTime() : null);
                  setRangeEnd(null);
                  setAnnotation(null);
                }}
              >
                <Clock3 size={13} />
                {anchor === null ? "Add timestamp" : formatReviewTime(anchor)}
                {rangeEnd !== null ? `–${formatReviewTime(rangeEnd)}` : ""}
                {anchor !== null ? <X size={12} aria-hidden="true" /> : null}
              </button>
              <div className="review-composer__actions">
                <ReviewVoiceRecorder
                  value={voice}
                  onChange={setVoice}
                  onRecordingChange={setRecording}
                  disabled={busy}
                  available={voiceAvailable}
                  active={active}
                  onPause={onPause}
                />
                <button
                  type="submit"
                  className="review-button review-button--primary review-composer__submit"
                  disabled={busy || recording || (!body.trim() && !voice)}
                  aria-label={busy ? "Saving comment" : "Post comment"}
                  title={busy ? "Saving comment" : "Post comment"}
                >
                  <ArrowUp size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
