import { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2 } from "lucide-react";
import { BLOG_HERO_FILM } from "../../lib/blog-hero";
import "../../styles/blog-hero-video.css";

export function BlogHeroVideo() {
  const stageRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      mediaRef.current?.pause();
      setStarted(false);
      setEnded(false);
      setReducedMotion(preference.matches);
    };
    update();
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) mediaRef.current?.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio < 0.12) mediaRef.current?.pause();
    }, { threshold: 0.12 });
    if (stageRef.current) observer.observe(stageRef.current);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      mediaRef.current?.pause();
    };
  }, []);

  const play = async () => {
    const media = mediaRef.current;
    if (!media) return;
    setError("");
    if (ended) media.currentTime = 0;
    if (media.error) media.load();
    try {
      await media.play();
    } catch {
      setError("The introduction couldn’t play. Try again, or read the transcript below.");
    }
  };
  const onPlay = () => { setStarted(true); setEnded(false); setError(""); };
  const onError = () => setError("The introduction couldn’t load. You can read the transcript below.");

  return <figure id="blog-studio-film" className="blog-hero-video" aria-labelledby="blog-film-title">
    <div ref={stageRef} className="blog-hero-video__stage" data-playback-mode={reducedMotion ? "audio" : "video"}>
      {reducedMotion ? <>
        <img className="blog-hero-video__still" src={BLOG_HERO_FILM.posterSrc} width={BLOG_HERO_FILM.width} height={BLOG_HERO_FILM.height} alt="An illustrated introduction to EdiCut’s editing workflow" />
        <audio
          ref={element => { mediaRef.current = element; }}
          className="blog-hero-video__audio"
          src={BLOG_HERO_FILM.audioSrc}
          preload="none"
          controls
          aria-label="Listen to the EdiCut studio introduction"
          aria-describedby="blog-film-description"
          onPlay={onPlay}
          onEnded={() => setEnded(true)}
          onError={onError}
        />
      </> : <video
        ref={element => { mediaRef.current = element; }}
        src={BLOG_HERO_FILM.videoSrc}
        poster={BLOG_HERO_FILM.posterSrc}
        width={BLOG_HERO_FILM.width}
        height={BLOG_HERO_FILM.height}
        controls
        playsInline
        preload="none"
        aria-label="EdiCut studio introduction with narration and music"
        aria-describedby="blog-film-description"
        onPlay={onPlay}
        onEnded={() => setEnded(true)}
        onError={onError}
      >
        <track kind="captions" src={BLOG_HERO_FILM.captionsSrc} srcLang="en" label="English" default />
        Your browser can’t play this film. The complete transcript is below.
      </video>}
      {!started || ended || error ? <button
        type="button"
        className="blog-hero-video__play"
        onClick={() => { void play(); }}
        aria-label={ended ? "Replay EdiCut studio introduction" : reducedMotion ? "Listen to EdiCut studio introduction" : "Play EdiCut studio introduction with audio"}
      >
        <span className="blog-hero-video__play-icon">{ended ? <RotateCcw size={24} aria-hidden="true" /> : <Play size={25} fill="currentColor" aria-hidden="true" />}</span>
        <span>{ended ? reducedMotion ? "Listen again" : "Watch again" : reducedMotion ? "Listen to the introduction" : "Meet EdiCut"}</span>
      </button> : null}
    </div>
    <figcaption className="blog-hero-video__caption">
      <div><h2 id="blog-film-title">{BLOG_HERO_FILM.title}</h2><p id="blog-film-description">{reducedMotion ? "Still artwork with narration and music." : "An illustrated introduction, with narration and music."}</p></div>
      <span className="blog-hero-video__duration"><Volume2 size={17} aria-hidden="true" /><span>{Math.ceil(BLOG_HERO_FILM.durationSeconds)} seconds</span></span>
    </figcaption>
    {error ? <p className="blog-hero-video__error" role="alert">{error}</p> : null}
    <details className="blog-hero-video__transcript"><summary>Read the video transcript</summary><div>{BLOG_HERO_FILM.transcript.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div></details>
  </figure>;
}
