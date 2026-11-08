import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ReviewPlaybackMenu } from "./ReviewPlaybackMenu";
import { ReviewCanvas } from "./ReviewCanvas";
import {
  reviewFrameTimecode,
  stepReviewFrame,
} from "../lib/review-annotations";
import {
  formatReviewFrameRate,
  reviewFrameRateOptions,
  type ReviewSourceFrameRate,
} from "../lib/review-frame-rate";
import {
  Expand,
  Minimize,
  Keyboard,
  Pause,
  Play,
  RotateCcw,
  StepBack,
  StepForward,
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
  currentTime: () => number;
  seek: (milliseconds: number, annotation?: FrameAnnotation | null) => void;
  pause: () => void;
};
export function ReviewPlayer({
  src,
  title,
  durationMs,
  mediaBytes,
  comments,
  onTime,
  onMark,
  onAddComment,
  onAnnotation,
  onSelectComment,
  playerRef,
  draftAnnotation,
  readOnly = false,
  youtubeId,
  draftBody,
  setDraftBody,
  onPost,
  busy,
  draftTime,
}: {
  src: string;
  title: string;
  durationMs: number;
  mediaBytes: number;
  comments: ReviewComment[];
  onTime: (milliseconds: number) => void;
  onMark: (milliseconds: number) => void;
  onAddComment: () => void;
  onAnnotation: (annotation: FrameAnnotation | null) => void;
  onSelectComment: (id: string) => void;
  playerRef: React.RefObject<ReviewPlayerHandle | null>;
  draftAnnotation?: FrameAnnotation | null;
  readOnly?: boolean;
  youtubeId?: string | null;
  draftBody: string;
  setDraftBody: (value: string) => void;
  onPost: () => void;
  busy: boolean;
  draftTime: number | null;
}) {
  const video = useRef<ReviewMediaHandle | null>(null),
    container = useRef<HTMLElement>(null),
    frame = useRef<HTMLDivElement>(null),
    toolbarHost = useRef<HTMLDivElement>(null),
    scrubber = useRef<HTMLDivElement>(null),
    previewVideo = useRef<HTMLVideoElement>(null),
    previewSeekTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    requestedPreviewTime = useRef<number | null>(null);
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(durationMs);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [annotation, setAnnotation] = useState<FrameAnnotation | null>(null);
  const [error, setError] = useState(false),
    [speed, setSpeed] = useState("1");
  const [playerNotice, setPlayerNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState(false),
    [fullscreen, setFullscreen] = useState(false),
    [volume, setVolume] = useState(1);
  const lastVolume = useRef(1);
  const [fps, setFps] = useState(30),
    [zoom, setZoom] = useState(1);
  const [sourceFrameRate, setSourceFrameRate] =
    useState<ReviewSourceFrameRate | null>(null);
  const [frameRatePending, setFrameRatePending] = useState(!youtubeId);
  const frameRateOptions = reviewFrameRateOptions(sourceFrameRate?.fps ?? null);
  const timecode = sourceFrameRate
    ? reviewFrameTimecode(time, fps)
    : formatReviewTime(time);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [toolbarTarget, setToolbarTarget] = useState<HTMLElement | null>(null);
  const [scrubPreview, setScrubPreview] = useState<{
    time: number;
    position: number;
  } | null>(null);
  const [previewInitialized, setPreviewInitialized] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  function readMetadata(media: HTMLVideoElement) {
    setDuration(
      Number.isFinite(media.duration)
        ? Math.round(media.duration * 1000)
        : durationMs,
    );
    if (media.videoWidth && media.videoHeight)
      setVideoAspect(media.videoWidth / media.videoHeight);
    setError(false);
    setLoaded(true);
  }
  useEffect(() => {
    // A cached video can finish loading before React attaches its media handlers.
    const media = video.current;
    if (
      !youtubeId &&
      media instanceof HTMLVideoElement &&
      media.readyState >= 1
    )
      readMetadata(media);
  }, [src, youtubeId, durationMs, reload]);
  useEffect(() => {
    setToolbarTarget(toolbarHost.current);
  }, []);
  useEffect(() => {
    setSourceFrameRate(null);
    if (youtubeId || !loaded || error) {
      setFrameRatePending(!youtubeId && !error);
      return;
    }
    const controller = new AbortController();
    setFrameRatePending(true);
    void import("../lib/review-frame-rate.client")
      .then(({ detectReviewFrameRate }) =>
        detectReviewFrameRate(src, mediaBytes, controller.signal),
      )
      .then((detected) => {
        if (controller.signal.aborted) return;
        setSourceFrameRate(detected);
        if (detected) setFps(detected.fps);
      })
      .catch(() => {
        // A failed bounded probe must not interrupt playback or invent a source FPS.
      })
      .finally(() => {
        if (!controller.signal.aborted) setFrameRatePending(false);
      });
    return () => controller.abort();
  }, [src, mediaBytes, youtubeId, loaded, error]);
  useEffect(() => {
    setScrubPreview(null);
    setPreviewInitialized(false);
    setPreviewReady(false);
    setPreviewFailed(false);
    requestedPreviewTime.current = null;
    if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
  }, [src]);
  useEffect(
    () => () => {
      if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
    },
    [],
  );
  useEffect(() => {
    setAnnotation(draftAnnotation ?? null);
  }, [draftAnnotation]);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const current = () => Math.round((video.current?.currentTime ?? 0) * 1000);
  function seek(milliseconds: number, mark?: FrameAnnotation | null) {
    if (!video.current) return;
    video.current.pause();
    setPlaying(false);
    const nextTime = Math.max(0, Math.min(duration, milliseconds));
    video.current.currentTime = nextTime / 1000;
    setAnnotation(mark ?? null);
    setTime(nextTime);
    onTime(nextTime);
  }
  function seekPreview() {
    const media = previewVideo.current,
      target = requestedPreviewTime.current;
    if (!media || target === null || media.readyState < 1) return;
    if (media.seeking) return;
    if (media.readyState >= 2 && Math.abs(media.currentTime - target) < 0.15) {
      setPreviewReady(true);
      return;
    }
    setPreviewReady(false);
    try {
      media.currentTime = target;
    } catch {
      setPreviewReady(false);
    }
  }
  function showScrubPreview(position: number) {
    if (youtubeId || duration <= 0) return;
    setPreviewInitialized(true);
    const normalizedPosition = Math.max(0, Math.min(1, position));
    const nextTime = normalizedPosition * duration;
    const scrubberWidth = scrubber.current?.getBoundingClientRect().width ?? 0;
    const edgePercent = scrubberWidth
      ? Math.min(49, (84 / scrubberWidth) * 100)
      : 9;
    requestedPreviewTime.current = nextTime / 1000;
    setScrubPreview({
      time: nextTime,
      position: Math.max(
        edgePercent,
        Math.min(100 - edgePercent, normalizedPosition * 100),
      ),
    });
    const media = previewVideo.current;
    if (
      !media ||
      media.readyState < 2 ||
      Math.abs(media.currentTime - nextTime / 1000) >= 0.15
    )
      setPreviewReady(false);
    if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
    previewSeekTimer.current = setTimeout(seekPreview, 70);
  }
  function previewScrubberPointer(clientX: number) {
    const bounds = scrubber.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    showScrubPreview((clientX - bounds.left) / bounds.width);
  }
  function hideScrubPreview() {
    setScrubPreview(null);
    requestedPreviewTime.current = null;
    if (previewSeekTimer.current) clearTimeout(previewSeekTimer.current);
  }
  useEffect(() => {
    playerRef.current = {
      currentTime: current,
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
    const changed = () =>
      setFullscreen(document.fullscreenElement === container.current);
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
      setAnnotation(null);
      setPlayerNotice("");
      video.current.play().catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setPlayerNotice("Playback couldn’t start. Press play to try again.");
      });
    } else video.current.pause();
  }
  const fittedWidth = Math.min(stageSize.width, stageSize.height * videoAspect);
  const fittedHeight = fittedWidth / videoAspect;
  return (
    <section
      ref={container}
      className="review-player"
      aria-label="Video player"
      onKeyDown={(event) => {
        const key = event.key.toLowerCase();
        const target = event.target as HTMLElement;
        if (
          target.closest(
            "input, textarea, select, a, summary, [role='combobox']",
          ) ||
          (target.closest("button") &&
            [" ", "enter", "arrowleft", "arrowright"].includes(key))
        )
          return;
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
        else if (
          ["j", "l", "arrowleft", "arrowright"].includes(key) &&
          (key === "j" || key === "l" || sourceFrameRate)
        )
          seek(
            key === "j" || key === "l"
              ? current() + (key === "j" ? -5000 : 5000)
              : stepReviewFrame(
                  current(),
                  fps,
                  key === "arrowleft" ? -1 : 1,
                  duration,
                ),
          );
        else if (key === "m" && !readOnly && loaded && !error) {
          video.current?.pause();
          onMark(current());
          focusComposer();
        } else if (key === "escape") {
          setAnnotation(null);
        }
      }}
    >
      <div ref={toolbarHost} className="review-player__canvas-toolbar" />
      <div
        ref={frame}
        className={`review-player__stage ${youtubeId ? "review-player__stage--youtube" : ""}`}
        style={{ "--review-zoom": zoom } as CSSProperties}
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
            onLoadedMetadata={(event) => readMetadata(event.currentTarget)}
            onCanPlay={(event) => {
              readMetadata(event.currentTarget);
              setBuffering(false);
            }}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onTimeUpdate={() => {
              const milliseconds = current();
              setTime(milliseconds);
              onTime(milliseconds);
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => {
              setPlaying(false);
              setBuffering(false);
              const value = current();
              setTime(value);
              onTime(value);
            }}
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
        {!youtubeId && !error && (!loaded || buffering) ? (
          <span className="review-player__loading" role="status">
            {loaded ? "Buffering…" : "Loading video…"}
          </span>
        ) : null}
        {!youtubeId &&
        loaded &&
        !playing &&
        !drawing &&
        !annotation &&
        !error ? (
          <button
            type="button"
            className="review-player__big-play"
            aria-label="Play video"
            onClick={toggle}
          >
            <Play size={30} fill="currentColor" aria-hidden="true" />
          </button>
        ) : null}
        <ReviewCanvas
          width={fittedWidth}
          height={fittedHeight}
          annotation={annotation}
          draftAnnotation={draftAnnotation}
          onAnnotation={(value) => {
            setAnnotation(value);
            onAnnotation(value);
          }}
          onMark={() => {
            const value = current();
            setTime(value);
            onTime(value);
            onMark(value);
          }}
          onPause={() => video.current?.pause()}
          time={time}
          readOnly={readOnly}
          disabled={!loaded || error}
          draftBody={draftBody}
          setDraftBody={setDraftBody}
          onPost={onPost}
          busy={busy}
          zoom={zoom}
          onZoom={setZoom}
          draftTime={draftTime}
          onToolChange={setDrawing}
          toolbarTarget={toolbarTarget}
        />
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
        <div
          ref={scrubber}
          className="review-player__scrubber"
          onPointerMove={(event) => previewScrubberPointer(event.clientX)}
          onPointerLeave={hideScrubPreview}
          onFocusCapture={() =>
            showScrubPreview(duration ? time / duration : 0)
          }
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              hideScrubPreview();
          }}
        >
          {!youtubeId ? (
            <div
              className={`review-player__scrub-preview ${scrubPreview ? "is-visible" : ""}`}
              style={{ left: `${scrubPreview?.position ?? 50}%` }}
              aria-hidden="true"
            >
              {previewInitialized ? (
                <video
                  key={src}
                  ref={previewVideo}
                  src={src}
                  muted
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={() => {
                    setPreviewFailed(false);
                    seekPreview();
                  }}
                  onLoadedData={() => {
                    const target = requestedPreviewTime.current;
                    const media = previewVideo.current;
                    if (
                      target !== null &&
                      media &&
                      Math.abs(media.currentTime - target) < 0.15
                    ) {
                      setPreviewFailed(false);
                      setPreviewReady(true);
                    }
                  }}
                  onSeeked={() => {
                    setPreviewReady(true);
                    seekPreview();
                  }}
                  onError={() => {
                    setPreviewReady(false);
                    setPreviewFailed(true);
                  }}
                  style={{ opacity: previewReady ? 1 : 0 }}
                />
              ) : null}
              {!previewReady ? (
                <span>
                  {previewFailed ? "Preview unavailable" : "Loading preview…"}
                </span>
              ) : null}
              <time>{formatReviewTime(scrubPreview?.time ?? 0)}</time>
            </div>
          ) : null}
          <input
            type="range"
            min={0}
            max={duration || 1}
            value={Math.min(time, duration)}
            step={sourceFrameRate ? 1000 / fps : "any"}
            disabled={!loaded || error}
            aria-label="Video timeline"
            aria-valuetext={`${formatReviewTime(time)} of ${formatReviewTime(duration)}`}
            onChange={(event) => seek(Number(event.target.value))}
            onKeyUp={(event) => {
              if (event.currentTarget === document.activeElement)
                showScrubPreview(duration ? time / duration : 0);
            }}
          />
          <div className="review-player__markers">
            {comments
              .filter(
                (comment) =>
                  comment.parentId === null && comment.timestampMs !== null,
              )
              .map((comment) => (
                <button
                  key={comment.id}
                  type="button"
                  className={`review-player__marker ${comment.resolved ? "is-resolved" : ""}`}
                  style={{
                    left: `${Math.min(100, (comment.timestampMs! / (duration || 1)) * 100)}%`,
                  }}
                  aria-label={`Comment at ${formatReviewTime(comment.timestampMs!)}: ${comment.body.slice(0, 65)}`}
                  title={`${formatReviewTime(comment.timestampMs!)} · ${comment.body.slice(0, 65)}`}
                  onClick={() => {
                    seek(comment.timestampMs!, comment.annotation);
                    onSelectComment(comment.id);
                    const target = document.getElementById(
                      `comment-${comment.id}`,
                    );
                    target?.focus({ preventScroll: true });
                    target?.scrollIntoView({ block: "nearest" });
                  }}
                />
              ))}
          </div>
        </div>
        <div className="review-player__transport">
          <div className="review-player__transport-main">
            <button
              type="button"
              className="review-icon-button review-player__mute"
              disabled={!loaded || error}
              aria-label={volume === 0 ? "Unmute video" : "Mute video"}
              title={volume === 0 ? "Unmute" : "Mute"}
              onClick={() => {
                const next = volume === 0 ? lastVolume.current : 0;
                if (volume > 0) lastVolume.current = volume;
                if (video.current) video.current.volume = next;
                setVolume(next);
              }}
            >
              {volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
            </button>
            <label className="review-player__volume">
              <span className="sr-only">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                disabled={!loaded || error}
                aria-label="Volume"
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (video.current) video.current.volume = next;
                  if (next > 0) lastVolume.current = next;
                  setVolume(next);
                }}
              />
            </label>
            <button
              type="button"
              className="review-icon-button review-player__transport-play"
              disabled={!loaded || error}
              onClick={toggle}
              aria-label={playing ? "Pause video" : "Play video"}
              title={playing ? "Pause (Space)" : "Play (Space)"}
            >
              {playing ? <Pause size={19} /> : <Play size={19} />}
            </button>
            <button
              type="button"
              className="review-icon-button review-player__frame-step--previous"
              disabled={!loaded || error || !sourceFrameRate}
              onClick={() =>
                seek(stepReviewFrame(current(), fps, -1, duration))
              }
              aria-label="Previous frame"
              title="Previous frame (←)"
            >
              <StepBack size={17} />
            </button>
            <button
              type="button"
              className="review-icon-button review-player__frame-step--next"
              disabled={!loaded || error || !sourceFrameRate}
              onClick={() => seek(stepReviewFrame(current(), fps, 1, duration))}
              aria-label="Next frame"
              title="Next frame (→)"
            >
              <StepForward size={17} />
            </button>
            <span
              className="review-player__time"
              aria-label={`Timecode ${timecode}`}
              title={
                sourceFrameRate
                  ? "Hours : minutes : seconds : frames"
                  : "Playback time"
              }
            >
              <span className="review-player__timecode">
                <span className="review-player__timecode-full">{timecode}</span>
                <span
                  className="review-player__timecode-mobile"
                  aria-hidden="true"
                >
                  {formatReviewTime(time)}
                </span>
              </span>{" "}
              <span className="review-player__duration">
                / {formatReviewTime(duration)}
              </span>
            </span>
          </div>
          <div className="review-player__transport-extra">
            <ReviewPlaybackMenu
              label="Source frame rate"
              value={sourceFrameRate ? String(fps) : ""}
              disabled={!loaded || error || !sourceFrameRate}
              placeholder={frameRatePending ? "FPS…" : "— fps"}
              title={
                sourceFrameRate
                  ? `${sourceFrameRate.variable ? "Estimated variable-rate source" : "Source"}: ${formatReviewFrameRate(sourceFrameRate.fps)} fps`
                  : "Source frame rate is unavailable. Frame stepping is disabled."
              }
              options={frameRateOptions.map((rate) => ({
                value: String(rate),
                label: `${formatReviewFrameRate(rate)} fps`,
              }))}
              onChange={(value) => {
                const next = Number(value);
                if (frameRateOptions.includes(next)) setFps(next);
              }}
            />
            <ReviewPlaybackMenu
              label="Playback speed"
              value={speed}
              disabled={!loaded || error}
              options={[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => ({
                value: String(value),
                label: `${value}×`,
              }))}
              onChange={(value) => {
                setSpeed(value);
                if (video.current) video.current.playbackRate = Number(value);
              }}
            />
            <details className="review-shortcuts">
              <summary
                aria-label="Keyboard shortcuts"
                title="Keyboard shortcuts"
              >
                <Keyboard size={18} />
              </summary>
              <div>
                <strong>Focus the video area or playback toolbar</strong>
                <p>
                  <kbd>Space</kbd> / <kbd>K</kbd> play or pause
                  <br />
                  <kbd>J</kbd> / <kbd>L</kbd> seek 5 seconds
                  <br />
                  <kbd>←</kbd> / <kbd>→</kbd> step a frame at the selected fps
                  <br />
                  <kbd>M</kbd> add a comment
                </p>
                <p>
                  In the comment field: <kbd>Ctrl</kbd> / <kbd>⌘</kbd> +{" "}
                  <kbd>Enter</kbd> to post.
                </p>
              </div>
            </details>
            <button
              type="button"
              className="review-icon-button review-player__fullscreen"
              aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen video"}
              title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
              onClick={() => {
                setPlayerNotice("");
                if (
                  !container.current?.requestFullscreen ||
                  !document.exitFullscreen
                ) {
                  setPlayerNotice("Fullscreen is unavailable in this browser.");
                  return;
                }
                const action = fullscreen
                  ? document.exitFullscreen()
                  : container.current?.requestFullscreen();
                void action?.catch(() =>
                  setPlayerNotice("Fullscreen is unavailable in this browser."),
                );
              }}
            >
              {fullscreen ? <Minimize size={18} /> : <Expand size={18} />}
            </button>
          </div>
        </div>
        {youtubeId ? (
          <p className="review-player__notice">
            Source FPS is unavailable for embedded YouTube previews.
          </p>
        ) : null}
        {playerNotice ? (
          <p className="review-player__notice" role="status">
            {playerNotice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
