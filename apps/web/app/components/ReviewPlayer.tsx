import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  Expand,
  Flag,
  Keyboard,
  MessageSquarePlus,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  SquareDashed,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  formatReviewTime,
  type FrameAnnotation,
  type ReviewComment,
} from "../lib/project-review";
import {
  YouTubeReviewVideo,
  type ReviewMediaHandle,
} from "./YouTubeReviewVideo";

export type ReviewPlayerHandle = {
  seek: (milliseconds: number, annotation?: FrameAnnotation | null) => void;
  pause: () => void;
};
export function ReviewPlayer({
  src,
  title,
  durationMs,
  comments,
  onTime,
  onMark,
  onAddComment,
  onAnnotation,
  onRange,
  onSelectComment,
  playerRef,
  draftAnnotation,
  readOnly = false,
  youtubeId,
}: {
  src: string;
  title: string;
  durationMs: number;
  comments: ReviewComment[];
  onTime: (milliseconds: number) => void;
  onMark: (milliseconds: number) => void;
  onAddComment: () => void;
  onAnnotation: (annotation: FrameAnnotation) => void;
  onRange: (start: number, end: number) => void;
  onSelectComment: (id: string) => void;
  playerRef: React.RefObject<ReviewPlayerHandle | null>;
  draftAnnotation?: FrameAnnotation | null;
  readOnly?: boolean;
  youtubeId?: string | null;
}) {
  const video = useRef<ReviewMediaHandle | null>(null),
    container = useRef<HTMLElement>(null),
    frame = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(durationMs);
  const [playing, setPlaying] = useState(false),
    [drawing, setDrawing] = useState(false);
  const [annotation, setAnnotation] = useState<FrameAnnotation | null>(null);
  const [error, setError] = useState(false),
    [speed, setSpeed] = useState("1");
  const [playerNotice, setPlayerNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [volume, setVolume] = useState(1),
    [rangeStart, setRangeStart] = useState<number | null>(null);
  const lastVolume = useRef(1);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  useEffect(() => {
    setAnnotation(draftAnnotation ?? null);
  }, [draftAnnotation]);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const current = () => Math.round((video.current?.currentTime ?? 0) * 1000);
  function seek(milliseconds: number, mark?: FrameAnnotation | null) {
    if (!video.current) return;
    video.current.pause();
    setPlaying(false);
    const nextTime = Math.round(Math.max(0, Math.min(duration, milliseconds)));
    video.current.currentTime = nextTime / 1000;
    setAnnotation(mark ?? null);
    setTime(nextTime);
    onTime(nextTime);
  }
  useEffect(() => {
    playerRef.current = {
      seek: (milliseconds, mark) => {
        seek(milliseconds, mark);
        frame.current?.scrollIntoView({ block: "nearest" });
      },
      pause: () => video.current?.pause(),
    };
    return () => {
      playerRef.current = null;
    };
  });
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === container.current);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  function focusComposer() {
    if (document.fullscreenElement === container.current)
      void document.exitFullscreen().then(onAddComment, onAddComment);
    else onAddComment();
  }
  useEffect(() => {
    if (!frame.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  function toggle() {
    if (!video.current || !loaded || error) return;
    if (video.current.paused) {
      setDrawing(false);
      setAnnotation(null);
      setPlayerNotice("");
      video.current.play().catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setPlayerNotice("Playback couldn’t start. Press play to try again.");
      });
    } else video.current.pause();
  }
  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    };
  }
  const fittedWidth = Math.min(stageSize.width, stageSize.height * videoAspect);
  const fittedHeight = fittedWidth / videoAspect;
  return (
    <section ref={container} className="review-player" aria-label="Video player"
        onKeyDown={(event) => {
          const key = event.key.toLowerCase();
          const target = event.target as HTMLElement;
          if (target.closest("input, textarea, select, a, summary, [role='combobox']") ||
              (target.closest("button") && [" ", "enter", "arrowleft", "arrowright"].includes(key))) return;
          if (
            [
              " ",
              "k",
              "j",
              "l",
              "arrowleft",
              "arrowright",
              "m",
              "escape",
            ].includes(key)
          )
            event.preventDefault();
          if (key === " " || key === "k") toggle();
          else if (["j", "l", "arrowleft", "arrowright"].includes(key))
            seek(
              current() +
                (key === "j"
                  ? -5000
                  : key === "l"
                    ? 5000
                    : key === "arrowleft"
                      ? -1000 / 30
                      : 1000 / 30),
            );
          else if (key === "m" && !readOnly && loaded && !error) {
            video.current?.pause();
            onMark(current());
            setRangeStart(null);
            focusComposer();
          } else if (key === "escape") {
            setDrawing(false);
            setAnnotation(null);
            setRangeStart(null);
          }
        }}
      >
      <div
        ref={frame}
        className={`review-player__stage ${youtubeId ? "review-player__stage--youtube" : ""}`}
        tabIndex={0}
        aria-label="Video preview. Focus this area for Space to play or pause, J and L to seek, and M to comment."
      >
        {youtubeId ? (
          <YouTubeReviewVideo
            key={`${youtubeId}:${reload}`}
            id={youtubeId}
            title={title}
            onReady={(handle) => {
              video.current = handle;
              setLoaded(Boolean(handle));
              if (handle) setError(false);
            }}
            onState={setPlaying}
            onError={() => setError(true)}
            onTime={(milliseconds, total) => {
              setTime(milliseconds);
              onTime(milliseconds);
              if (total > 0) setDuration(total);
              if (video.current) setSpeed(String(video.current.playbackRate));
            }}
          />
        ) : (
          <video
            ref={(node) => {
              video.current = node;
            }}
            src={src}
            playsInline
            preload="metadata"
            controls={false}
            aria-label={title}
            onLoadedMetadata={(event) => {
              const media = event.currentTarget;
              setDuration(
                Number.isFinite(media.duration)
                  ? Math.round(media.duration * 1000)
                  : durationMs,
              );
              if (media.videoWidth && media.videoHeight)
                setVideoAspect(media.videoWidth / media.videoHeight);
              setError(false);
              setLoaded(true);
            }}
            onTimeUpdate={() => {
              const milliseconds = current();
              setTime(milliseconds);
              onTime(milliseconds);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onVolumeChange={(event) => setVolume(event.currentTarget.volume)}
            onEnded={() => setPlaying(false)}
            onError={() => setError(true)}
            onClick={toggle}
          />
        )}
        {error && !youtubeId ? (
          <div className="review-player__error" role="alert">
            <strong>This preview couldn’t load</strong>
            <p>
              Check your connection, then reload the video. Your feedback is
              safe.
            </p>
            <button
              type="button"
              className="review-button review-button--light"
              onClick={() => {
                setError(false);
                video.current?.load();
              }}
            >
              <RotateCcw size={16} />
              Reload video
            </button>
          </div>
        ) : null}
        {!youtubeId && !playing && !drawing && !annotation && !error ? (
          <button
            type="button"
            className="review-player__big-play"
            aria-label="Play video"
            onClick={toggle}
          >
            <Play size={30} fill="currentColor" aria-hidden="true" />
          </button>
        ) : null}
        {!youtubeId ? (
          <div
            ref={surface}
            className={`review-player__annotation ${drawing ? "is-drawing" : ""}`}
            style={{
              width: fittedWidth || "100%",
              height: fittedHeight || "100%",
            }}
            aria-hidden="true"
            onPointerDown={(event) => {
              if (!drawing) return;
              event.preventDefault();
              video.current?.pause();
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = point(event);
              setAnnotation(null);
            }}
            onPointerMove={(event) => {
              if (!drag.current) return;
              const end = point(event),
                start = drag.current;
              setAnnotation({
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                width: Math.abs(end.x - start.x),
                height: Math.abs(end.y - start.y),
              });
            }}
            onPointerCancel={() => {
              drag.current = null;
              setDrawing(false);
              setAnnotation(null);
            }}
            onPointerUp={(event) => {
              if (!drag.current) return;
              const end = point(event),
                start = drag.current;
              const box = {
                x: Math.min(start.x, end.x),
                y: Math.min(start.y, end.y),
                width: Math.abs(end.x - start.x),
                height: Math.abs(end.y - start.y),
              };
              drag.current = null;
              setDrawing(false);
              if (box.width >= 0.005 && box.height >= 0.005) {
                setAnnotation(box);
                onMark(current());
                onAnnotation(box);
                focusComposer();
              } else setAnnotation(null);
            }}
          >
            {annotation ? (
              <div
                className="review-player__box"
                style={{
                  left: `${annotation.x * 100}%`,
                  top: `${annotation.y * 100}%`,
                  width: `${annotation.width * 100}%`,
                  height: `${annotation.height * 100}%`,
                }}
              />
            ) : null}
          </div>
        ) : null}
        {drawing ? (
          <span className="review-player__hint">
            Drag a box around the area to change. Escape cancels.
          </span>
        ) : null}
      </div>
      {error && youtubeId ? (
        <div className="review-notice" role="alert">
          <div>
            <strong>YouTube preview is not ready</strong>
            <p>
              The video may still be processing, or playback may be unavailable.
              Your feedback is saved.
            </p>
            <button
              type="button"
              className="review-button"
              onClick={() => {
                setError(false);
                setReload((value) => value + 1);
              }}
            >
              Retry preview
            </button>
          </div>
        </div>
      ) : null}
      <div className="review-player__controls">
        <div className="review-player__scrubber">
          <input type="range" min={0} max={duration || 1}
            value={Math.min(time, duration)} step={100} disabled={!loaded || error}
            aria-label="Video timeline"
            aria-valuetext={`${formatReviewTime(time)} of ${formatReviewTime(duration)}`}
            onChange={(event) => seek(Number(event.target.value))} />
          <div className="review-player__markers">
            {comments.filter((comment) => comment.parentId === null && comment.timestampMs !== null).map((comment) => (
              <button key={comment.id} type="button"
                className={`review-player__marker ${comment.resolved ? "is-resolved" : ""}`}
                style={{ left: `${Math.min(100, (comment.timestampMs! / (duration || 1)) * 100)}%` }}
                aria-label={`Comment at ${formatReviewTime(comment.timestampMs!)}: ${comment.body.slice(0, 65)}`}
                title={`${formatReviewTime(comment.timestampMs!)} · ${comment.body.slice(0, 65)}`}
                onClick={() => {
                  seek(comment.timestampMs!, comment.annotation);
                  onSelectComment(comment.id);
                  const target = document.getElementById(`comment-${comment.id}`);
                  target?.focus({ preventScroll: true });
                  target?.scrollIntoView({ block: "nearest" });
                }} />
            ))}
          </div>
        </div>
        <div className="review-player__transport">
          <div className="review-player__transport-main">
            <button type="button" className="review-icon-button" disabled={!loaded || error}
              onClick={toggle} aria-label={playing ? "Pause video" : "Play video"} title={playing ? "Pause (Space)" : "Play (Space)"}>
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button type="button" className="review-icon-button" disabled={!loaded || error}
              onClick={() => seek(current() - 5000)} aria-label="Back five seconds" title="Back 5 seconds (J)"><SkipBack size={17} /></button>
            <button type="button" className="review-icon-button" disabled={!loaded || error}
              onClick={() => seek(current() + 5000)} aria-label="Forward five seconds" title="Forward 5 seconds (L)"><SkipForward size={17} /></button>
            <span className="review-player__time">{formatReviewTime(time)} <span>/ {formatReviewTime(duration)}</span></span>
          </div>
          <div className="review-player__transport-extra">
            <label className="review-player__speed">
              <span className="sr-only">Playback speed</span>
              <select value={speed} disabled={!loaded || error} onChange={(event) => {
                setSpeed(event.target.value);
                if (video.current) video.current.playbackRate = Number(event.target.value);
              }}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}
              </select>
            </label>
            <button type="button" className="review-icon-button" disabled={!loaded || error}
              aria-label={volume === 0 ? "Unmute video" : "Mute video"} title={volume === 0 ? "Unmute" : "Mute"}
              onClick={() => {
                const next = volume === 0 ? lastVolume.current : 0;
                if (volume > 0) lastVolume.current = volume;
                if (video.current) video.current.volume = next;
                setVolume(next);
              }}>{volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
            <label className="review-player__volume">
              <span className="sr-only">Volume</span>
              <input type="range" min="0" max="1" step="0.05" value={volume} disabled={!loaded || error} aria-label="Volume"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (video.current) video.current.volume = next;
                  if (next > 0) lastVolume.current = next;
                  setVolume(next);
                }} />
            </label>
            <button type="button" className="review-icon-button" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen video"} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => {
                setPlayerNotice("");
                if (!container.current?.requestFullscreen || !document.exitFullscreen) {
                  setPlayerNotice("Fullscreen is unavailable in this browser.");
                  return;
                }
                const action = fullscreen ? document.exitFullscreen() : container.current?.requestFullscreen();
                void action?.catch(() => setPlayerNotice("Fullscreen is unavailable in this browser."));
              }}><Expand size={18} /></button>
          </div>
        </div>
        <div className="review-player__tools">
          <button type="button" className="review-button review-button--primary" disabled={readOnly || !loaded || error}
            title={`Add a comment at ${formatReviewTime(time)} (M)`}
            onClick={() => {
              video.current?.pause();
              setRangeStart(null);
              onMark(current());
              focusComposer();
            }}><MessageSquarePlus size={16} />Comment</button>
          <button type="button" className={`review-button review-button--quiet ${rangeStart !== null ? "is-selected" : ""}`}
            disabled={readOnly || !loaded || error} aria-pressed={rangeStart !== null}
            title={rangeStart === null ? "Set a start, move the playhead, then mark the end" : "Use this playhead position as the range end"}
            onClick={() => {
              video.current?.pause();
              const now = current();
              if (rangeStart === null) {
                setRangeStart(now);
                onMark(now);
              } else {
                onRange(Math.min(rangeStart, now), Math.max(rangeStart, now));
                setRangeStart(null);
                focusComposer();
              }
            }}><Flag size={16} />{rangeStart === null ? "Mark range" : "End range"}</button>
          {!youtubeId ? <button type="button" className={`review-icon-button ${drawing ? "is-selected" : ""}`}
            aria-label="Draw a frame area" title="Draw a frame area" aria-pressed={drawing} disabled={readOnly || !loaded || error}
            onClick={() => {
              video.current?.pause();
              onMark(current());
              setDrawing(!drawing);
              setAnnotation(null);
            }}><SquareDashed size={17} /></button> : null}
          <details className="review-shortcuts">
            <summary aria-label="Keyboard shortcuts" title="Keyboard shortcuts"><Keyboard size={18} /></summary>
            <div><strong>Focus the video area or playback toolbar</strong><p><kbd>Space</kbd> / <kbd>K</kbd> play or pause<br />
              <kbd>J</kbd> / <kbd>L</kbd> seek 5 seconds<br />
              <kbd>←</kbd> / <kbd>→</kbd> step a frame (approx.)<br />
              <kbd>M</kbd> add a comment</p><p>In the comment field: <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>Enter</kbd> to post.</p></div>
          </details>
        </div>
        {rangeStart !== null ? <div className="review-player__range-status" role="status">
          Start {formatReviewTime(rangeStart)}. Move the playhead, then choose End range.
          <button type="button" className="review-icon-button" aria-label="Cancel range" onClick={() => setRangeStart(null)}><X size={15} /></button>
        </div> : null}
        {playerNotice ? <p className="review-player__notice" role="status">{playerNotice}</p> : null}
      </div>
    </section>
  );
}
