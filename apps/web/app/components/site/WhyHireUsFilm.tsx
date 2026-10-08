import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ArrowRight, Film, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { Link } from "react-router";
import { WhyHireUsArtwork } from "./WhyHireUsArtwork";
import { getFilmFrame, WHY_HIRE_US_AUDIO, whyHireUsScenes } from "./why-hire-us-film-timeline";

export function WhyHireUsFilm({ showPlanButton = true }: { showPlanButton?: boolean }) {
  const [frame, setFrame] = useState(() => getFilmFrame(0, false));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef(false);
  const playAttempt = useRef(0);
  const descriptionId = useId();
  const scriptId = useId();
  const isPoster = !hasStarted;
  const { position, layers } = frame;
  const copyLayoutLayer = layers.reduce((current, layer) => layer.copyOpacity > current.copyOpacity ? layer : current);
  const playbackLabel = audioError ? "Retry" : isPlaying ? isBuffering ? "Loading…" : "Pause" : hasEnded ? "Replay" : hasStarted ? "Resume" : "Intro";

  const sync = useCallback(() => {
    setFrame(getFilmFrame(audioRef.current?.currentTime ?? 0, hasStartedRef.current));
  }, []);

  const pause = useCallback(() => {
    playAttempt.current += 1;
    audioRef.current?.pause();
    setIsPlaying(false);
    setIsBuffering(false);
    sync();
  }, [sync]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => { playAttempt.current += 1; audio?.pause(); };
  }, []);

  useEffect(() => {
    if (!isPlaying || isBuffering) return;
    let frame = 0;
    const tick = () => { sync(); frame = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, isBuffering, sync]);

  useEffect(() => {
    if (!isPlaying) return;
    const onVisibilityChange = () => { if (document.hidden) pause(); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) pause();
    });
    if (filmRef.current) observer?.observe(filmRef.current);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", onVisibilityChange); };
  }, [isPlaying, pause]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { pause(); return; }
    const attempt = ++playAttempt.current;
    if (audioError) audio.load();
    if (hasEnded) audio.currentTime = 0;
    setAudioError(false);
    setHasEnded(false);
    setHasStarted(true);
    hasStartedRef.current = true;
    sync();
    setIsPlaying(true);
    setIsBuffering(true);
    try {
      // Start within the click gesture for Safari and other autoplay restrictions.
      await audio.play();
      if (attempt !== playAttempt.current) return;
      setIsBuffering(false);
    } catch (error: unknown) {
      if (attempt !== playAttempt.current || (error instanceof DOMException && error.name === "AbortError")) return;
      setAudioError(true);
      setIsPlaying(false);
      setIsBuffering(false);
    }
  }

  return (
    <div ref={filmRef} className={`studio-film ${showPlanButton ? "" : "studio-film--no-plan"} ${isPlaying ? "studio-film--playing" : "studio-film--paused"} ${isPoster ? "studio-film--poster" : "studio-film--scene"}`}>
      <div className="studio-film__screen" role="group" aria-label="Why hire EdiCut — narrated introduction" aria-describedby={`${descriptionId} ${scriptId}`}>
        <div className="studio-film__copy">
          <span className="studio-film__brand neo-section-label"><Film size={16} aria-hidden="true" />Why EdiCut</span>
          <div className="studio-film__story">
          <div className="studio-film__titles">{layers.map((layer) => {
            const active = layer.isPoster === isPoster && layer.sceneIndex === position.sceneIndex;
            return <p key={layer.key} className={`studio-film__title studio-film__title--${layer.isPoster ? "poster" : "scene"} studio-film__copy-layer`} aria-hidden={!active} data-active={active} data-layout={layer.key === copyLayoutLayer.key}
              style={{ "--copy-opacity": layer.copyOpacity, "--copy-y": `${layer.y}px` } as CSSProperties}>
              {layer.isPoster ? <>More creating.<br />Less managing.</> : whyHireUsScenes[layer.sceneIndex].title}
            </p>;
          })}</div>
          <div className="studio-film__captions">{layers.map((layer) => {
            const active = layer.isPoster === isPoster && layer.sceneIndex === position.sceneIndex;
            return <p key={layer.key} id={active ? descriptionId : undefined} className="studio-film__description studio-film__copy-layer" aria-hidden={!active || !layer.cueVisible} data-active={active} data-layout={layer.key === copyLayoutLayer.key}
              style={{ "--copy-opacity": layer.copyOpacity, "--copy-y": `${layer.y * .6}px` } as CSSProperties}>
              {!layer.cueVisible ? "" : layer.isPoster ? "A dedicated editor. A project manager. One dashboard for every edit. Meet the studio behind your next video." : whyHireUsScenes[layer.sceneIndex].cues[layer.cueIndex].copy}
            </p>;
          })}</div>
          </div>
        </div>
        <div className="studio-film__media">
          <div className="studio-film__artwork" data-scene={position.sceneIndex} data-cue={position.cueIndex} data-transition={layers.length > 1}>
            {layers.map((layer) => <div key={layer.key} className="studio-film__artwork-layer" data-layer={layer.key} data-active={layer.isPoster === isPoster && layer.sceneIndex === position.sceneIndex}
              style={{ "--film-time": layer.localTime, "--layer-opacity": layer.opacity, "--layer-x": `${layer.x}px`, "--layer-scale": layer.scale } as CSSProperties}>
              <WhyHireUsArtwork scene={layer.sceneIndex} />
            </div>)}
          </div>
          <div className="studio-film__controls">
            <button type="button" className="studio-film__watch neo-button neo-button--primary" aria-label={playbackLabel} onClick={() => { void togglePlayback(); }}>
              <span className="studio-film__play-icon">{isPlaying ? <Pause size={17} fill="currentColor" aria-hidden="true" /> : <Play size={17} fill="currentColor" aria-hidden="true" />}</span>
              <span className="studio-film__watch-label" aria-hidden="true"><span key={playbackLabel} className="studio-film__watch-label-text">{playbackLabel}</span></span>
            </button>
            <button type="button" className="studio-film__sound neo-button" onClick={() => {
              const nextMuted = !isMuted;
              if (audioRef.current) audioRef.current.muted = nextMuted;
              setIsMuted(nextMuted);
            }} aria-label={isMuted ? "Unmute film audio" : "Mute film audio"} aria-pressed={isMuted} title={isMuted ? "Turn sound on" : "Mute sound"}>
              {isMuted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            </button>
          </div>
          {audioError ? <p className="studio-film__error" role="status">The film audio couldn’t load. Try again to continue.</p> : null}
        </div>
        {showPlanButton ? <div className="studio-film__actions"><Link to="/pricing" className="studio-button neo-button neo-button--primary">Find your editing plan <ArrowRight size={17} aria-hidden="true" /></Link></div> : null}
      </div>
      <p id={scriptId} className="sr-only">{whyHireUsScenes.flatMap((item) => item.cues.map((cue) => cue.copy)).join(" ")}</p>
      <audio ref={audioRef} src={WHY_HIRE_US_AUDIO} preload="none" muted={isMuted}
        onTimeUpdate={sync} onSeeked={sync}
        onWaiting={() => setIsBuffering(true)} onPlaying={() => setIsBuffering(false)}
        onPause={() => { setIsPlaying(false); setIsBuffering(false); sync(); }}
        onEnded={() => { sync(); setHasEnded(true); setIsPlaying(false); setIsBuffering(false); }}
        onError={() => { setAudioError(true); setIsPlaying(false); setIsBuffering(false); }}
      />
    </div>
  );
}
