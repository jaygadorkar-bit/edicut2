import { useEffect, useRef, useState } from "react";
import { Link, type MetaFunction } from "react-router";
import { ArrowLeft, Pause, Play, RotateCcw } from "lucide-react";
import { AnimatedLogo } from "../components/AnimatedLogo";
import { LOGO_DURATION, logoPhase, logoTracks } from "../lib/logo-animation";
import "../styles/logo-animation.css";

export const meta: MetaFunction = () => [
  { title: "Logo animation | EdiCut" },
  { name: "robots", content: "noindex,nofollow" },
];
export function headers() {
  return { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };
}
const seconds = (ms: number) => (ms / 1000).toFixed(2);

export default function LogoAnimationPreview() {
  const svg = useRef<SVGSVGElement>(null);
  const animations = useRef<Animation[]>([]);
  const frame = useRef(0),
    loopTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const position = useRef(LOGO_DURATION),
    playing = useRef(false),
    rate = useRef(1),
    repeat = useRef(false),
    reduced = useRef(false);
  const [time, setTime] = useState(LOGO_DURATION),
    [isPlaying, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1),
    [loop, setLoop] = useState(false);
  const [ready, setReady] = useState(false),
    [supported, setSupported] = useState(true),
    [reducedMotion, setReducedMotion] = useState(false);
  const [background, setBackground] = useState("paper");

  function cancelClock() {
    cancelAnimationFrame(frame.current);
    clearTimeout(loopTimer.current);
    loopTimer.current = undefined;
  }
  function seek(value: number) {
    cancelClock();
    playing.current = false;
    setPlaying(false);
    const next = Math.max(0, Math.min(LOGO_DURATION, value));
    for (const animation of animations.current) {
      animation.pause();
      animation.currentTime = next;
    }
    position.current = next;
    setTime(next);
  }
  function tick() {
    if (!playing.current) return;
    const next = Math.max(
      0,
      Math.min(
        LOGO_DURATION,
        Number(animations.current[0]?.currentTime ?? position.current),
      ),
    );
    position.current = next;
    setTime(next);
    if (next >= LOGO_DURATION) {
      playing.current = false;
      setPlaying(false);
      if (
        repeat.current &&
        !reduced.current &&
        document.visibilityState === "visible"
      )
        loopTimer.current = setTimeout(() => play(0), 550 / rate.current);
    } else frame.current = requestAnimationFrame(tick);
  }
  function play(from = position.current) {
    if (!animations.current.length) return;
    cancelClock();
    const next = from >= LOGO_DURATION ? 0 : from;
    const clock = Number(document.timeline.currentTime ?? performance.now());
    for (const animation of animations.current) {
      animation.pause();
      animation.currentTime = next;
      animation.playbackRate = rate.current;
      animation.play();
      animation.startTime = clock - next / rate.current;
    }
    position.current = next;
    setTime(next);
    playing.current = true;
    setPlaying(true);
    frame.current = requestAnimationFrame(tick);
  }
  function pause() {
    seek(Number(animations.current[0]?.currentTime ?? position.current));
  }
  function changeSpeed(value: number) {
    const wasPlaying = playing.current;
    const current = Number(
      animations.current[0]?.currentTime ?? position.current,
    );
    rate.current = value;
    setSpeed(value);
    if (wasPlaying) play(current);
    else seek(current);
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.current = media.matches;
    setReducedMotion(media.matches);
    if (!svg.current || typeof svg.current.animate !== "function") {
      setSupported(false);
      setReady(true);
      return;
    }
    animations.current = logoTracks.map((track) => {
      const node = svg.current!.querySelector<SVGElement>(
        `[data-logo-part="${track.part}"]`,
      )!;
      node.style.transformBox = "view-box";
      node.style.transformOrigin = track.origin;
      const animation = node.animate(track.frames, {
        duration: LOGO_DURATION,
        fill: "both",
      });
      animation.pause();
      animation.currentTime = LOGO_DURATION;
      return animation;
    });
    setReady(true);
    if (!media.matches) play(0);
    const preferenceChanged = () => {
      reduced.current = media.matches;
      setReducedMotion(media.matches);
      if (media.matches) {
        repeat.current = false;
        setLoop(false);
        seek(LOGO_DURATION);
      }
    };
    const visibilityChanged = () => {
      if (document.visibilityState !== "visible") {
        if (playing.current) pause();
        else cancelClock();
      }
    };
    media.addEventListener("change", preferenceChanged);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      cancelClock();
      playing.current = false;
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      media.removeEventListener("change", preferenceChanged);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, []);

  const disabled = !ready || !supported;
  const status = !ready
    ? "Loading preview"
    : !supported
      ? "Static preview"
      : isPlaying
        ? "Playing"
        : time >= LOGO_DURATION
          ? "Complete"
          : "Paused";
  return (
    <main className="logo-preview">
      <header className="logo-preview__header">
        <div>
          <h1>Logo animation</h1>
          <p>EdiCut · Motion preview</p>
        </div>
        <Link to="/site/node-logmin" className="logo-preview__back">
          <ArrowLeft size={17} aria-hidden="true" />
          <span>Workspace</span>
        </Link>
      </header>
      <section
        className={`logo-preview__stage logo-preview__stage--${background}`}
        data-ready={ready}
        aria-label="Logo animation preview"
      >
        <div className="logo-preview__stage-meta">
          <span>
            <span className={isPlaying ? "is-playing" : ""} />
            {status}
          </span>
          <span>2.4 seconds</span>
        </div>
        <AnimatedLogo svgRef={svg} />
        <noscript>
          <img
            className="logo-preview__fallback"
            src="/icons/edicut-logo.svg"
            alt="EdiCut logo"
          />
        </noscript>
        <div className="logo-preview__stage-footer">
          <span>Stagger. Stretch. Clap.</span>
          <fieldset className="logo-preview__backgrounds">
            <legend className="sr-only">Preview background</legend>
            {[
              ["paper", "Paper"],
              ["transparent", "Transparency"],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-label={`${label} background`}
                title={label}
                aria-pressed={background === value}
                onClick={() => setBackground(value)}
              >
                <span
                  className={`logo-preview__swatch logo-preview__swatch--${value}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </fieldset>
        </div>
      </section>
      <section
        className="logo-preview__controls"
        aria-label="Animation controls"
      >
        <div className="logo-preview__timeline">
          <span aria-hidden="true">{seconds(time)}s</span>
          <input
            type="range"
            min={0}
            max={LOGO_DURATION}
            step={10}
            value={Math.round(time / 10) * 10}
            aria-label="Animation timeline"
            aria-valuetext={`${seconds(time)} of 2.40 seconds, ${logoPhase(time)}`}
            disabled={disabled}
            onChange={(event) => seek(Number(event.target.value))}
            style={
              {
                "--logo-progress": `${(time / LOGO_DURATION) * 100}%`,
              } as React.CSSProperties
            }
          />
          <span aria-hidden="true">2.40s</span>
        </div>
        <div className="logo-preview__actions">
          <div className="logo-preview__playback">
            <button
              type="button"
              className="logo-preview__replay"
              disabled={disabled}
              onClick={() => play(0)}
            >
              <RotateCcw size={17} aria-hidden="true" />
              Replay
            </button>
            <button
              type="button"
              className="logo-preview__pause"
              disabled={disabled}
              aria-label={
                isPlaying
                  ? "Pause animation"
                  : time >= LOGO_DURATION
                    ? "Play animation"
                    : "Resume animation"
              }
              onClick={() => (isPlaying ? pause() : play())}
            >
              {isPlaying ? (
                <Pause size={17} aria-hidden="true" />
              ) : (
                <Play size={17} aria-hidden="true" />
              )}
              {isPlaying ? "Pause" : time >= LOGO_DURATION ? "Play" : "Resume"}
            </button>
          </div>
          <fieldset className="logo-preview__speeds">
            <legend>Speed</legend>
            {[0.5, 1, 1.5].map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} times speed`}
                aria-pressed={speed === value}
                disabled={disabled}
                onClick={() => changeSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </fieldset>
          <label className="logo-preview__loop">
            <input
              type="checkbox"
              checked={loop}
              disabled={disabled || reducedMotion}
              onChange={(event) => {
                repeat.current = event.target.checked;
                setLoop(event.target.checked);
                if (!event.target.checked) clearTimeout(loopTimer.current);
              }}
            />
            Loop
          </label>
        </div>
        <div className="logo-preview__notes">
          <p>
            {!supported
              ? "This browser can show the static logo. Try a current browser to play the animation."
              : reducedMotion
                ? "Reduced motion is on. The preview starts still; press Replay to animate."
                : "Drag the timeline to inspect any moment."}
          </p>
          <span role="status" aria-live="polite">
            {status}
          </span>
        </div>
      </section>
    </main>
  );
}
