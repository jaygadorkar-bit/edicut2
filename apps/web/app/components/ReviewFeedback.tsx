import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  Clock3,
  Download,
  MessageCircle,
  Send,
  SlidersHorizontal,
  SquareDashed,
  X,
} from "lucide-react";
import { FormSelect } from "./FormSelect";
import {
  formatReviewTime,
  parseFrameAnnotation,
  parseReviewTime,
  reviewCsv,
  type FrameAnnotation,
  type ReviewActor,
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
  comments,
  actor,
  onSubmit,
  onSeek,
  time,
  anchor,
  setAnchor,
  rangeEnd,
  setRangeEnd,
  selectedComment,
  annotation,
  setAnnotation,
  composerRef,
  busy,
  onDraftChange,
  onPause,
}: {
  version: ReviewVersion;
  comments: ReviewComment[];
  actor: ReviewActor;
  onSubmit: ReviewSubmit;
  onSeek: (milliseconds: number, annotation?: FrameAnnotation | null) => void;
  time: number;
  anchor: number | null;
  setAnchor: (value: number | null) => void;
  rangeEnd: number | null;
  setRangeEnd: (value: number | null) => void;
  selectedComment: string | null;
  annotation: FrameAnnotation | null;
  setAnnotation: (value: FrameAnnotation | null) => void;
  composerRef: React.RefObject<HTMLTextAreaElement | null>;
  busy: boolean;
  onDraftChange: (value: boolean) => void;
  onPause: () => void;
}) {
  const [filter, setFilter] = useState("open"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("time");
  const [body, setBody] = useState(""),
    [category, setCategory] = useState("change"),
    [priority, setPriority] = useState("normal");
  const [timeText, setTimeText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null),
    [reply, setReply] = useState("");
  const token = useRef<string | null>(null),
    replyToken = useRef<string | null>(null);
  const payload = useRef("");
  const [localError, setLocalError] = useState("");
  const roots = comments.filter((comment) => !comment.parentId);
  const visible = roots
    .filter(
      (comment) =>
        (filter === "all" ||
          (filter === "open" && !comment.resolved) ||
          (filter === "resolved" && comment.resolved) ||
          (filter === "mine" && comment.actorKey === actor.key)) &&
        `${comment.body} ${comment.authorName} ${comment.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "newest"
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : (a.timestampMs ?? Infinity) - (b.timestampMs ?? Infinity) ||
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  const count = roots.filter((comment) => !comment.resolved).length;
  const inputClass = "review-field";
  useEffect(() => {
    if (selectedComment) {
      setFilter("all");
      setQuery("");
    }
  }, [selectedComment]);
  useEffect(() => {
    if (selectedComment && filter === "all" && !query) {
      const comment = document.getElementById(`comment-${selectedComment}`);
      comment?.focus({ preventScroll: true });
      comment?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedComment, filter, query]);
  useEffect(() => {
    onDraftChange(Boolean(body.trim() || reply.trim() || annotation || rangeEnd !== null));
    return () => onDraftChange(false);
  }, [body, reply, annotation, rangeEnd, onDraftChange]);
  function exportFeedback() {
    const blob = new Blob(["\uFEFF", reviewCsv(comments)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "video-feedback.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function addComment() {
    setLocalError("");
    if (!body.trim()) {
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
      category,
      priority,
    });
    if (payload.current !== nextPayload || !token.current) {
      token.current = crypto.randomUUID();
      payload.current = nextPayload;
    }
    Object.entries({
      intent: "add-comment",
      versionId: version.id,
      commentId: token.current,
      body,
      timestampMs: anchor === null ? "" : String(anchor),
      endMs: rangeEnd === null ? "" : String(rangeEnd),
      annotation: annotation ? JSON.stringify(annotation) : "",
      category,
      priority,
    }).forEach(([key, value]) => form.set(key, value));
    const result = await onSubmit(form);
    if (!result.error) {
      setBody("");
      setAnchor(null);
      setRangeEnd(null);
      setAnnotation(null);
      token.current = null;
    }
  }
  async function addReply(commentId: string) {
    if (!reply.trim()) return;
    replyToken.current ??= crypto.randomUUID();
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
  return (
    <section className="review-feedback" aria-label="Version feedback">
      <div className="review-feedback__compose">
      {version.decision === "approved" ? (
        <div className="review-feedback__approved">
          <CheckCheck size={20} />
          <p>This version is approved. Feedback is preserved for reference.</p>
        </div>
      ) : (
        <form
          className="review-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void addComment();
          }}
        >
          <div className="review-composer__anchor">
            <label htmlFor="review-comment-body">Leave a comment</label>
            <button
              type="button"
              className={`review-time-chip ${anchor === null ? "is-general" : ""}`}
              aria-label={anchor === null ? "Attach current playback time" : "Remove timestamp"}
              onClick={() => {
                setAnchor(anchor === null ? time : null);
                setRangeEnd(null);
                setAnnotation(null);
              }}
            >
              <Clock3 size={13} />
              {anchor === null ? "Add timestamp" : formatReviewTime(anchor)}
              {rangeEnd !== null ? `–${formatReviewTime(rangeEnd)}` : ""}
              {anchor !== null ? <X size={12} aria-hidden="true" /> : null}
            </button>
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
                {rangeEnd === null ? "at playhead" : formatReviewTime(rangeEnd)}
              </button>
            ) : null}
          </div>
          <textarea
            ref={composerRef}
            id="review-comment-body"
            onFocus={onPause}
            rows={3}
            maxLength={4000}
            required
            readOnly={busy}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              token.current = null;
              setLocalError("");
            }}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !busy) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Add your feedback…"
          />
          <details className="review-composer__details">
            <summary>Options</summary>
            <div className="review-composer__time-input">
              <label htmlFor="review-time">Timestamp</label>
              <input
                id="review-time"
                className={inputClass}
                value={timeText}
                onChange={(event) => setTimeText(event.target.value)}
                placeholder="0:24"
              />
              <button
                type="button"
                className="review-button review-button--quiet"
                onClick={() => {
                  const parsed = parseReviewTime(timeText);
                  if (parsed === null || parsed > version.durationMs) {
                    setLocalError(
                      "Enter a time within the video, such as 0:24.",
                    );
                    return;
                  }
                  setAnchor(parsed);
                  setRangeEnd(null);
                  setAnnotation(null);
                  setLocalError("");
                  onSeek(parsed);
                }}
              >
                Set
              </button>
            </div>
            {version.provider !== "youtube" ? <>
            <p className="review-help">
              Add a rectangle with the player, or enter percentages for keyboard
              access.
            </p>
            <div className="review-composer__coordinates">
              {(["x", "y", "width", "height"] as const).map((key) => (
                <label key={key}>
                  {key === "x"
                    ? "Left %"
                    : key === "y"
                      ? "Top %"
                      : key === "width"
                        ? "Width %"
                        : "Height %"}
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(
                      (annotation?.[key] ??
                        (key === "width" || key === "height" ? 0.25 : 0)) * 100,
                    )}
                    onChange={(event) => {
                      const box = {
                        x: 0,
                        y: 0,
                        width: 0.25,
                        height: 0.25,
                        ...annotation,
                        [key]: Number(event.target.value) / 100,
                      };
                      const parsed = parseFrameAnnotation(JSON.stringify(box));
                      if (parsed) {
                        setAnnotation(parsed);
                        if (anchor === null) setAnchor(time);
                        setLocalError("");
                      } else
                        setLocalError(
                          "Keep the whole rectangle inside the frame.",
                        );
                    }}
                  />
                </label>
              ))}
            </div>
            </> : null}
            {rangeEnd !== null ? (
              <button
                type="button"
                className="review-button review-button--quiet"
                onClick={() => setRangeEnd(null)}
              >
                Remove range end
              </button>
            ) : null}
          <div className="review-composer__choices">
            <div>
              <label htmlFor="review-category" id="review-category-label">
                Type
              </label>
              <FormSelect
                id="review-category"
                name="category"
                value={category}
                options={[
                  { value: "change", label: "Change" },
                  { value: "question", label: "Question" },
                  { value: "praise", label: "Looks good" },
                ]}
                onChange={setCategory}
                className="review-field"
              />
            </div>
            <div>
              <label htmlFor="review-priority" id="review-priority-label">
                Priority
              </label>
              <FormSelect
                id="review-priority"
                name="priority"
                value={priority}
                options={[
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                ]}
                onChange={setPriority}
                className="review-field"
              />
            </div>
          </div>
          </details>
          {localError ? (
            <p className="review-error" role="alert">
              {localError}
            </p>
          ) : null}
          <div className="review-composer__footer">
            <span title="Keyboard shortcut">Ctrl / ⌘ + Enter</span>
            <button
              type="submit"
              className="review-button review-button--primary"
              disabled={busy || !body.trim()}
            >
              <Send size={15} />
              {busy ? "Saving…" : "Post comment"}
            </button>
          </div>
        </form>
      )}
      </div>
      <div className="review-feedback__threads">
      <div className="review-feedback__heading">
        <div>
          <h2>
            Feedback <span>{roots.length}</span>
          </h2>
        </div>
        <button
          type="button"
          className="review-icon-button"
          onClick={exportFeedback}
          disabled={!comments.length}
          aria-label="Export this version’s feedback as CSV"
          title="Export feedback"
        >
          <Download size={18} />
        </button>
      </div>
      {roots.length > 0 ? <div
        className="review-feedback__filters"
        role="group"
        aria-label="Filter comments"
      >
        {[
          ["open", "Open"],
          ["all", "All"],
          ["resolved", "Resolved"],
          ["mine", "Mine"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={filter === value}
            className={filter === value ? "is-active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
            {value === "open" ? <span>{count}</span> : null}
          </button>
        ))}
      </div> : null}
      {roots.length > 0 ? <div className="review-feedback__search">
        <label>
          <span className="sr-only">Search feedback</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a comment…"
          />
        </label>
        <label className="review-feedback__sort">
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span className="sr-only">Sort feedback</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="time">By time</option>
            <option value="newest">Newest</option>
          </select>
        </label>
      </div> : null}
      <div className="review-feedback__list" aria-label="Comments">
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
                <button
                  type="button"
                  className={`review-icon-button review-comment__resolve ${comment.resolved ? "is-done" : ""}`}
                  aria-label={
                    comment.resolved ? "Reopen comment" : "Resolve comment"
                  }
                  title={
                    comment.resolved ? "Reopen comment" : "Resolve comment"
                  }
                  disabled={busy || version.decision === "approved"}
                  onClick={() => {
                    const form = new FormData();
                    Object.entries({
                      intent: "resolve-comment",
                      versionId: version.id,
                      commentId: comment.id,
                      expectedResolved: String(comment.resolved),
                    }).forEach(([key, value]) => form.set(key, value));
                    void onSubmit(form);
                  }}
                >
                  <Check size={17} />
                </button>
              </div>
              <div className="review-comment__tags">
                {comment.timestampMs !== null ? (
                  <button
                    type="button"
                    className="review-time-chip"
                    onClick={() =>
                      onSeek(comment.timestampMs!, comment.annotation)
                    }
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
                ) : (
                  <span className="review-comment__general">General</span>
                )}
                <span
                  className={`review-category review-category--${comment.category}`}
                >
                  {comment.category === "change"
                    ? "Change"
                    : comment.category === "question"
                      ? "Question"
                      : "Looks good"}
                </span>
                {comment.priority === "high" ? (
                  <span className="review-priority">High priority</span>
                ) : null}
              </div>
              <p className="review-comment__body">{comment.body}</p>
              {comments
                .filter((reply) => reply.parentId === comment.id)
                .map((reply) => (
                  <div className="review-reply" key={reply.id}>
                    <strong>{reply.authorName}</strong>
                    <p>{reply.body}</p>
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
                    <label className="sr-only" htmlFor={`reply-${comment.id}`}>
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
            <h3>
              {query
                ? "No matching comments"
                : filter === "resolved"
                  ? "No resolved comments yet"
                  : filter === "mine"
                    ? "Your feedback goes here"
                    : count === 0 && roots.length
                      ? "All feedback is resolved"
                      : "No feedback yet"}
            </h3>
            <p>
              {query
                ? "Try another word or clear the search."
                : !roots.length
                  ? "Add a comment at any point in the video."
                : version.decision === "approved"
                  ? "Choose All to read the saved feedback."
                  : "Pause the video where something needs attention and leave a note."}
            </p>
          </div>
        )}
      </div>
      </div>
    </section>
  );
}
