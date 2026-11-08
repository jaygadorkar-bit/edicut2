import { useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2 } from "lucide-react";
import {
  formatReviewTime,
  REVIEW_VOICE_MAX_BYTES,
  REVIEW_VOICE_MAX_DURATION_MS,
} from "../lib/project-review";
export type ReviewVoiceDraft = { file: File; durationMs: number };

export function ReviewVoiceRecorder({
  value,
  onChange,
  onRecordingChange,
  disabled,
  available,
  active,
  onPause,
}: {
  value: ReviewVoiceDraft | null;
  onChange: (value: ReviewVoiceDraft | null) => void;
  onRecordingChange: (value: boolean) => void;
  disabled: boolean;
  available: boolean;
  active: boolean;
  onPause: () => void;
}) {
  const [state, setState] = useState<"idle" | "requesting" | "recording">(
    "idle",
  );
  const [error, setError] = useState(""),
    [elapsed, setElapsed] = useState(0),
    [url, setUrl] = useState("");
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopTracks();
    };
  }, []);
  useEffect(() => {
    if (!value) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(value.file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [value]);
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }
  useEffect(() => {
    if (!active) stop();
  }, [active]);
  async function start() {
    if (disabled || !available || !active || state !== "idle") return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "Voice recording is unavailable in this browser. Use a written instruction.",
      );
      return;
    }
    setError("");
    setState("requesting");
    onRecordingChange(true);
    onPause();
    try {
      const input = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!mounted.current) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!activeRef.current) {
        input.getTracks().forEach((track) => track.stop());
        setState("idle");
        onRecordingChange(false);
        return;
      }
      stream.current = input;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mime) throw new Error("format");
      const capture = new MediaRecorder(input, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });
      recorder.current = capture;
      const chunks: Blob[] = [],
        started = Date.now();
      let bytes = 0,
        failed = false;
      capture.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          bytes += event.data.size;
        }
        if (bytes > REVIEW_VOICE_MAX_BYTES) {
          failed = true;
          stop();
        }
      };
      capture.onerror = () => {
        failed = true;
        stop();
      };
      capture.onstop = () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        stopTracks();
        recorder.current = null;
        if (!mounted.current) return;
        setState("idle");
        onRecordingChange(false);
        const durationMs = Math.max(
          1,
          Math.min(REVIEW_VOICE_MAX_DURATION_MS, Date.now() - started),
        );
        if (failed || !bytes) {
          setError(
            "The recording could not be saved. Try a shorter voice note.",
          );
          return;
        }
        const type = capture.mimeType.split(";")[0],
          extension =
            type === "audio/mp4"
              ? "m4a"
              : type === "audio/ogg"
                ? "ogg"
                : "webm";
        onChange({
          file: new File(
            chunks,
            `instruction-${crypto.randomUUID()}.${extension}`,
            { type },
          ),
          durationMs,
        });
      };
      input
        .getAudioTracks()
        .forEach((track) =>
          track.addEventListener("ended", stop, { once: true }),
        );
      capture.start(1000);
      setElapsed(0);
      setState("recording");
      timer.current = setInterval(() => {
        const ms = Date.now() - started;
        if (mounted.current) setElapsed(ms);
        if (ms >= REVIEW_VOICE_MAX_DURATION_MS) stop();
      }, 250);
    } catch (reason) {
      stopTracks();
      if (!mounted.current) return;
      setState("idle");
      onRecordingChange(false);
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Microphone access was declined. Allow it in your browser or use a written instruction."
          : "Microphone recording could not start. Check your microphone and try again.",
      );
    }
  }
  return (
    <div className="review-voice">
      {value ? (
        <div className="review-voice__preview">
          <Mic size={15} />
          <audio
            controls
            preload="metadata"
            src={url}
            aria-label="Preview voice instruction"
            onPlay={onPause}
          />
          <button
            type="button"
            aria-label="Remove voice instruction"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            <Trash2 size={15} />
          </button>
          <span>{formatReviewTime(value.durationMs)}</span>
        </div>
      ) : state === "recording" ? (
        <div className="review-voice__recording">
          <span className="review-voice__dot" />
          <span role="status">
            Recording {formatReviewTime(elapsed)} / 2:00
          </span>
          <button type="button" className="review-button" onClick={stop}>
            <Square size={13} fill="currentColor" />
            Stop recording
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="review-voice__trigger"
          disabled={disabled || !available || state === "requesting"}
          aria-label={
            state === "requesting" ? "Waiting for microphone" : "Record instructions"
          }
          onClick={() => void start()}
          title={
            available
              ? "Record a private voice instruction, up to 2 minutes"
              : "Voice instructions need connected Google Drive storage"
          }
        >
          <Mic size={17} aria-hidden="true" />
        </button>
      )}
      {error ? (
        <p className="review-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
