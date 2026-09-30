import { useEffect, useLayoutEffect, useRef } from "react";
import Lenis from "lenis";
import { useLocation } from "react-router";

const useIsomorphicLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

export function SmoothScroll() {
  const location = useLocation();
  const previousPathname = useRef(location.pathname);

  useIsomorphicLayoutEffect(() => {
    const pathnameChanged = previousPathname.current !== location.pathname;
    previousPathname.current = location.pathname;

    if (!pathnameChanged || location.hash) return;

    if (window.__lenis) {
      window.__lenis.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.hash, location.pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    // Keep normal anchor deep-links such as /#portfolio intact.
    if (!window.location.hash) {
      window.scrollTo(0, 0);
      let forceFrames = 20;
      const forceTop = () => {
        window.scrollTo(0, 0);
        if (--forceFrames > 0) window.requestAnimationFrame(forceTop);
      };
      window.requestAnimationFrame(forceTop);
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      duration: 1.15,
      easing: (time: number) => Math.min(1, 1.001 - Math.pow(2, -10 * time)),
      smoothWheel: true,
      anchors: true,
      stopInertiaOnNavigate: true,
      touchMultiplier: 1.4,
    });
    window.__lenis = lenis;

    let animationFrame = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      animationFrame = window.requestAnimationFrame(loop);
    };

    animationFrame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      lenis.destroy();
      if (window.__lenis === lenis) delete window.__lenis;
    };
  }, []);

  return null;
}
