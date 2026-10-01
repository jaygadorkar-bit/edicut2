import { useEffect, useLayoutEffect, useRef } from "react";
import type Lenis from "lenis";
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

    const managesScrollRestoration = "scrollRestoration" in window.history;
    const previousScrollRestoration = managesScrollRestoration ? window.history.scrollRestoration : undefined;
    if (managesScrollRestoration) window.history.scrollRestoration = "manual";
    const restoreScrollRestoration = () => {
      if (managesScrollRestoration && previousScrollRestoration && window.history.scrollRestoration === "manual") {
        window.history.scrollRestoration = previousScrollRestoration;
      }
    };

    // Keep normal anchor deep-links such as /#portfolio intact.
    if (!window.location.hash) {
      window.scrollTo(0, 0);
    }

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return restoreScrollRestoration;

    const isCompactViewport = window.matchMedia?.("(max-width: 639px)").matches ?? false;
    let disposed = false;
    let lenis: Lenis | null = null;
    let animationFrame = 0;

    const startLenis = async () => {
      const { default: LenisConstructor } = await import("lenis");
      if (disposed) return;

      lenis = new LenisConstructor({
        duration: 1.15,
        easing: (time: number) => Math.min(1, 1.001 - Math.pow(2, -10 * time)),
        // On phone-sized layouts, let wheel/trackpad input follow the browser's
        // native scroll immediately. Long Lenis easing can keep moving against
        // a quick direction change and makes narrow pages feel like they jump.
        smoothWheel: !isCompactViewport,
        anchors: true,
        stopInertiaOnNavigate: true,
        touchMultiplier: 1.4,
      });

      const instance = lenis;
      window.__lenis = instance;

      const loop = (time: number) => {
        if (disposed) return;
        instance.raf(time);
        animationFrame = window.requestAnimationFrame(loop);
      };

      animationFrame = window.requestAnimationFrame(loop);
    };

    void startLenis().catch(() => {
      // Enhanced scrolling is optional; keep native browser scrolling on chunk/network failure.
      restoreScrollRestoration();
    });

    return () => {
      disposed = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      lenis?.destroy();
      if (window.__lenis === lenis) delete window.__lenis;
      restoreScrollRestoration();
    };
  }, []);

  return null;
}
