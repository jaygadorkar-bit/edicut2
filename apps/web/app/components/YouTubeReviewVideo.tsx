import { useEffect, useRef } from "react";
export type ReviewMediaHandle = {
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  volume: number;
  playbackRate: number;
  play: () => Promise<void>;
  pause: () => void;
  load: () => void;
};
type Player = {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVolume: () => number;
  setVolume: (value: number) => void;
  getPlaybackRate: () => number;
  setPlaybackRate: (value: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (time: number, allowSeekAhead: boolean) => void;
  cueVideoById: (id: string) => void;
  getIframe: () => HTMLIFrameElement;
  destroy: () => void;
};
type YouTubeAPI = {
  Player: new (node: HTMLElement, options: Record<string, unknown>) => Player;
};
type YouTubeWindow = Window & {
  YT?: YouTubeAPI;
  onYouTubeIframeAPIReady?: () => void;
};
let apiPromise: Promise<YouTubeAPI> | null = null;
function loadYouTubeAPI() {
  const target = window as YouTubeWindow;
  if (target.YT?.Player) return Promise.resolve(target.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YouTubeAPI>((resolve, reject) => {
    const previous = target.onYouTubeIframeAPIReady;
    const script = document.createElement("script");
    let timer = 0;
    const failed = () => {
      window.clearTimeout(timer);
      script.remove();
      target.onYouTubeIframeAPIReady = previous;
      reject(new Error("YouTube player could not load"));
    };
    target.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      try {
        previous?.();
      } catch {}
      if (target.YT?.Player) resolve(target.YT);
      else failed();
    };
    script.src = "https://www.youtube.com/iframe_api";
    script.referrerPolicy = "strict-origin-when-cross-origin";
    script.async = true;
    script.onerror = failed;
    timer = window.setTimeout(failed, 20000);
    document.head.appendChild(script);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  return apiPromise;
}
export function YouTubeReviewVideo({
  id,
  title,
  onReady,
  onTime,
  onState,
  onError,
}: {
  id: string;
  title: string;
  onReady: (handle: ReviewMediaHandle | null) => void;
  onTime: (milliseconds: number, duration: number) => void;
  onState: (playing: boolean) => void;
  onError: () => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    callbacks = useRef({ onReady, onTime, onState, onError });
  callbacks.current = { onReady, onTime, onState, onError };
  useEffect(() => {
    let stopped = false,
      player: Player | undefined,
      timer = 0;
    if (!/^[\w-]{11}$/.test(id)) {
      callbacks.current.onError();
      return;
    }
    const hidden = () => {
      if (document.visibilityState !== "visible") player?.pauseVideo();
    };
    document.addEventListener("visibilitychange", hidden);
    void loadYouTubeAPI()
      .then((api) => {
        if (stopped || !container.current) return;
        const host = document.createElement("iframe");
        host.src = `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&playsinline=1&controls=0&rel=0`;
        host.title = title;
        // YouTube requires the embedding site's origin. Override only this
        // iframe; project URLs and the page's private referrer policy stay private.
        host.referrerPolicy = "strict-origin-when-cross-origin";
        host.allow =
          "autoplay; encrypted-media; picture-in-picture; fullscreen";
        host.allowFullscreen = true;
        container.current.appendChild(host);
        player = new api.Player(host, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          videoId: id,
          playerVars: {
            enablejsapi: 1,
            origin: window.location.origin,
            playsinline: 1,
            controls: 0,
            rel: 0,
          },
          events: {
            onReady: () => {
              if (stopped || !player) return;
              player.getIframe().title = title;
              const handle: ReviewMediaHandle = {
                get currentTime() {
                  return player?.getCurrentTime() || 0;
                },
                set currentTime(value) {
                  player?.seekTo(value, true);
                },
                get duration() {
                  return player?.getDuration() || 0;
                },
                get paused() {
                  return player?.getPlayerState() !== 1;
                },
                get volume() {
                  return (player?.getVolume() ?? 100) / 100;
                },
                set volume(value) {
                  player?.setVolume(value * 100);
                },
                get playbackRate() {
                  return player?.getPlaybackRate() || 1;
                },
                set playbackRate(value) {
                  player?.setPlaybackRate(value);
                },
                play: async () => {
                  player?.playVideo();
                },
                pause: () => player?.pauseVideo(),
                load: () => player?.cueVideoById(id),
              };
              callbacks.current.onReady(handle);
              timer = window.setInterval(() => {
                if (!stopped && document.visibilityState === "visible")
                  callbacks.current.onTime(
                    Math.round(handle.currentTime * 1000),
                    Math.round(handle.duration * 1000),
                  );
              }, 250);
            },
            onStateChange: (event: { data: number }) => {
              if (!stopped) callbacks.current.onState(event.data === 1);
            },
            onError: () => {
              if (!stopped) callbacks.current.onError();
            },
          },
        });
      })
      .catch(() => {
        if (!stopped) callbacks.current.onError();
      });
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
      callbacks.current.onReady(null);
      player?.destroy();
    };
  }, [id, title]);
  return <div ref={container} className="review-player__youtube" />;
}
