import { useEffect, useRef, useState } from "react";
import { FileVideo, Upload, X } from "lucide-react";
import { Link } from "react-router";
import {
  REVIEW_MAX_BYTES,
  REVIEW_MAX_DURATION_MS,
  formatReviewTime,
  type ReviewStorage,
} from "../lib/project-review";
import type { ReviewSubmit } from "./ReviewFeedback";

export function ReviewUpload({
  onSubmit,
  busy,
  onClose,
  onDraftChange,
  storage,
  admin = false,
}: {
  onSubmit: ReviewSubmit;
  busy: boolean;
  onClose: () => void;
  onDraftChange: (value: boolean) => void;
  storage?: ReviewStorage;
  admin?: boolean;
}) {
  const connected = storage?.connected ?? true,
    maxBytes = storage?.maxBytes ?? REVIEW_MAX_BYTES;
  const [consent, setConsent] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [duration, setDuration] = useState(0),
    [title, setTitle] = useState("");
  const [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0),
    [dragging, setDragging] = useState(false),
    [reading, setReading] = useState(false);
  const uploadId = useRef<string | null>(null),
    readId = useRef(0),
    cleanup = useRef<(() => void) | null>(null);
  useEffect(() => {
    onDraftChange(Boolean(file || title.trim() || note.trim()));
    return () => onDraftChange(false);
  }, [file, title, note, onDraftChange]);
  useEffect(
    () => () => {
      readId.current++;
      cleanup.current?.();
    },
    [],
  );
  function choose(selected: File | undefined) {
    cleanup.current?.();
    setError("");
    setDuration(0);
    setFile(null);
    setConsent(false);
    setReading(false);
    const id = ++readId.current;
    if (!selected) return;
    if (
      !selected.size ||
      selected.size > maxBytes ||
      !["video/mp4", "video/webm"].includes(selected.type)
    ) {
      setError(
        `Choose an MP4 or WebM video up to ${maxBytes > REVIEW_MAX_BYTES ? "10 GB" : "50 MB"}.`,
      );
      return;
    }
    setReading(true);
    const media = document.createElement("video"),
      url = URL.createObjectURL(selected);
    const release = () => {
      media.removeAttribute("src");
      media.load();
      URL.revokeObjectURL(url);
      window.clearTimeout(timeout);
    };
    cleanup.current = release;
    const timeout = window.setTimeout(() => {
      if (id === readId.current) {
        setReading(false);
        setError(
          "This video’s duration could not be read. Export it as MP4 or WebM and try again.",
        );
      }
      release();
    }, 10000);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      if (id === readId.current) {
        const milliseconds = Math.round(media.duration * 1000);
        if (
          !Number.isSafeInteger(milliseconds) ||
          milliseconds < 1 ||
          milliseconds > REVIEW_MAX_DURATION_MS
        )
          setError("Choose a playable video up to six hours long.");
        else {
          setFile(selected);
          setDuration(milliseconds);
          setTitle(selected.name.replace(/\.[^.]+$/, "").slice(0, 160));
          uploadId.current = crypto.randomUUID();
        }
        setReading(false);
      }
      media.onerror = null;
      release();
    };
    media.onerror = () => {
      if (id === readId.current) {
        setReading(false);
        setError(
          "This video could not be opened. Try a browser-compatible MP4 or WebM export.",
        );
      }
      media.onerror = null;
      release();
    };
    media.src = url;
  }
  return (
    <section className="review-upload" aria-labelledby="review-upload-heading">
      <div className="review-section-heading">
        <div>
          <h2 id="review-upload-heading">Upload a new cut</h2>
          <p>Keep each round of feedback with the version it belongs to.</p>
        </div>
        <button
          type="button"
          className="review-icon-button"
          aria-label="Close upload form"
          onClick={onClose}
          disabled={busy}
        >
          <X size={18} />
        </button>
      </div>
      {storage && !connected ? (
        <div className="review-notice">
          <div>
            <strong>{storage?.provider === "google_drive" ? "Connect Google Drive to upload review cuts" : "Connect YouTube to upload review cuts"}</strong>
            <p>
              {admin
                ? "Connect your studio channel once, then your assigned editors can upload from any project."
                : "An administrator needs to connect the studio’s YouTube channel before you can upload."}
            </p>
            {admin ? (
              <Link
                to="/site/node-logmin/video-storage"
                className="review-button"
              >
                Set up video storage
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (!file || !duration || !uploadId.current || busy) return;
          const form = new FormData();
          form.set("intent", "upload-version");
          form.set("video", file);
          form.set("durationMs", String(duration));
          form.set("title", title);
          form.set("note", note);
          form.set("uploadId", uploadId.current);
          if (storage) {
            form.set("provider", storage.provider);
            form.set("shareConsent", consent ? "yes" : "no");
            if (storage.provider === "youtube") form.set("youtubeConsent", consent ? "yes" : "no");
          }
          setProgress(0);
          const result = await onSubmit(form, setProgress);
          if (!result.error) {
            onDraftChange(false);
            setFile(null);
            setTitle("");
            setNote("");
            onClose();
          }
        }}
      >
        <label
          className={`review-upload__drop ${dragging ? "is-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy && connected) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy && connected) choose(event.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            name="video"
            accept="video/mp4,video/webm,.mp4,.webm"
            disabled={busy || reading || !connected}
            onChange={(event) => choose(event.target.files?.[0])}
          />
          {file ? <FileVideo size={29} /> : <Upload size={29} />}
          <strong>
            {reading
              ? "Reading your video…"
              : file?.name || "Drop your video here, or choose a file"}
          </strong>
          <span>
            {file
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB · ${formatReviewTime(duration)}`
              : `MP4 or WebM · up to ${maxBytes > REVIEW_MAX_BYTES ? "10 GB" : "50 MB"}`}
          </span>
        </label>
        <div className="review-upload__fields">
          <label htmlFor="cut-title">
            Version title
            <input
              id="cut-title"
              className="review-field"
              value={title}
              required
              maxLength={storage ? 100 : 160}
              onChange={(event) => setTitle(event.target.value)}
              disabled={busy}
              placeholder="e.g. Product launch — second cut"
              autoComplete="off"
            />
          </label>
          <label htmlFor="cut-note">
            What changed? <span>Optional</span>
            <textarea
              id="cut-note"
              className="review-field"
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
              placeholder="Tell your client what to look for in this version."
            />
          </label>
        </div>
        {error ? (
          <p className="review-error" role="alert">
            {error}
          </p>
        ) : null}
        {busy ? (
          <div className="review-upload__progress" role="status">
            <progress
              max={100}
              value={progress}
              aria-label="Video upload progress"
            />
            <span>
              {progress < 100
                ? `Uploading ${progress}%`
                : "Saving your review version…"}
            </span>
          </div>
        ) : null}
        {storage ? (
          <label className="review-upload__consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={busy || !file}
            />
            <span>
              I have permission to share this video with this project for review and agree to the{" "}
              <Link to="/privacy" target="_blank">privacy policy</Link>
              {storage?.provider === "youtube" ? <>{" "}and{" "}<a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a></> : null}.
            </span>
          </label>
        ) : null}
        <div className="review-upload__footer">
          <p>
            {storage?.provider === "youtube" ? (
              <>
                Uploaded to {storage.channelName || "your studio channel"} as an
                unlisted YouTube video. Anyone with its link can watch. Keep
                original master files in your own archive.
              </>
            ) : storage?.provider === "google_drive" ? (
              <>Uploaded privately to your studio’s Google Drive. Only project members with access in EdiCut can play it.</>
            ) : (
              <>
                Only this project’s client and assigned team can play the
                uploaded video. Include captions in your review export when
                needed.
              </>
            )}
          </p>
          <button
            type="submit"
            className="review-button review-button--primary"
            disabled={
              busy ||
              !file ||
              !title.trim() ||
              !duration ||
              !connected ||
              Boolean(storage && !consent)
            }
          >
            <Upload size={16} />
            {busy
              ? "Uploading…"
              : storage
                ? storage.provider === "google_drive" ? "Upload to Google Drive" : "Upload to YouTube"
                : "Upload for review"}
          </button>
        </div>
      </form>
    </section>
  );
}
