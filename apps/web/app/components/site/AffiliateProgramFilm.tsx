import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Film, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { AffiliateProgramArtwork } from "./AffiliateProgramArtwork";
import { affiliateFilmContent } from "./affiliate-film-content";
import { getAffiliateFilmFrame } from "./affiliate-film-timeline";

export function AffiliateProgramFilm() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const filmRef = useRef<HTMLElement>(null);
  const attempt = useRef(0);
  const [time, setTime] = useState(0);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState(false);
  const transcriptId = useId();
  const frame = getAffiliateFilmFrame(time, started);
  const sync = useCallback(() => setTime(audioRef.current?.currentTime ?? 0), []);
  const pause = useCallback(() => {
    attempt.current += 1;
    audioRef.current?.pause();
    setPlaying(false);
    setBuffering(false);
    sync();
  }, [sync]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => { attempt.current += 1; audio?.pause(); };
  }, []);

  useEffect(() => {
    if (!playing || buffering) return;
    let request = 0;
    const tick = () => { sync(); request = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(request);
  }, [playing, buffering, sync]);

  useEffect(() => {
    if (!playing) return;
    const hide = () => { if (document.hidden) pause(); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) pause();
    });
    if (filmRef.current) observer?.observe(filmRef.current);
    document.addEventListener("visibilitychange", hide);
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", hide); };
  }, [playing, pause]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { pause(); return; }
    const currentAttempt = ++attempt.current;
    if (error) audio.load();
    if (ended) { audio.currentTime = 0; setTime(0); }
    setError(false);
    setEnded(false);
    setStarted(true);
    setPlaying(true);
    setBuffering(true);
    try {
      await audio.play();
      if (currentAttempt === attempt.current) setBuffering(false);
    } catch (cause) {
      if (currentAttempt !== attempt.current || (cause instanceof DOMException && cause.name === "AbortError")) return;
      setError(true);
      setPlaying(false);
      setBuffering(false);
    }
  }

  const label = error ? "Retry film" : playing ? buffering ? "Loading…" : "Pause" : ended ? "Replay" : started ? "Resume" : "Play film";
  const Icon = playing ? Pause : ended ? RotateCcw : Play;

  return <figure ref={filmRef} id="affiliate-film" className="affiliate-film" aria-label="The EdiCut affiliate program, explained" aria-describedby={transcriptId}>
    <div className="affiliate-film__topline"><span><Film size={15} aria-hidden="true" /> How the partnership works</span><span>{Math.round(affiliateFilmContent.duration)} sec</span></div>
    <div className="affiliate-film__stage" data-started={started} data-scene={frame.active}>
      {frame.layers.map(layer => <div key={layer.index} className="affiliate-film__art-layer" data-active={frame.active === layer.index}
        style={{ "--art-opacity": layer.opacity, "--art-shift": `${(1 - layer.opacity) * 12}px`, "--film-time": layer.localTime } as CSSProperties}>
        <AffiliateProgramArtwork scene={layer.index} />
      </div>)}
    </div>
    <figcaption className="affiliate-film__caption">
      {!started ? <div><h2>From a recommendation to a reward.</h2><p>Meet the program, see how referrals work, and find your next opportunity.</p></div> : frame.layers.map(layer => {
        const scene = affiliateFilmContent.scenes[layer.index];
        return <div key={layer.index} className="affiliate-film__copy-layer" data-active={frame.active === layer.index} aria-hidden={frame.active !== layer.index}
          style={{ "--copy-opacity": layer.copyOpacity } as CSSProperties}><h2>{scene.title}</h2><p>{layer.cueVisible ? scene.cues[layer.cue].copy : "\u00a0"}</p></div>;
      })}
    </figcaption>
    <div className="affiliate-film__controls">
      <button type="button" onClick={() => { void toggle(); }} className="neo-button affiliate-film__play" aria-label={`${label} affiliate program video`}>
        <Icon size={16} aria-hidden="true" /><span>{label}</span>
      </button>
      <span className="affiliate-film__audio-note">Narration & music</span>
      <button type="button" className="neo-button affiliate-film__mute" aria-label={muted ? "Unmute affiliate film" : "Mute affiliate film"} aria-pressed={muted}
        onClick={() => { const next = !muted; if (audioRef.current) audioRef.current.muted = next; setMuted(next); }}>
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>
    </div>
    {error ? <p className="affiliate-film__error" role="status">The audio couldn’t load. Try again, or read the transcript below.</p> : null}
    <details className="affiliate-film__transcript"><summary>Read the transcript</summary><p id={transcriptId}>{affiliateFilmContent.scenes.flatMap(scene => scene.cues.map(cue => cue.copy)).join(" ")}</p></details>
    <audio ref={audioRef} src={affiliateFilmContent.audio} preload="none" muted={muted}
      onTimeUpdate={sync} onSeeked={sync} onWaiting={() => setBuffering(true)}
      onPlaying={() => { setBuffering(false); setPlaying(true); }}
      onPause={() => { setPlaying(false); setBuffering(false); sync(); }}
      onEnded={() => { sync(); setEnded(true); setPlaying(false); setBuffering(false); }}
      onError={() => { setError(true); setPlaying(false); setBuffering(false); }} />
  </figure>;
}
