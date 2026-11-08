import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import {
  classifySiteAnalyticsSource,
  isConversionOnlyAnalyticsPath,
  hasSiteAnalyticsConsent,
  isPublicAnalyticsPath,
  isSafeSiteAnalyticsLandingPath,
  SITE_ANALYTICS_EVENTS,
  SITE_ANALYTICS_REGIONS,
  SITE_ANALYTICS_SOURCES,
  setSiteAnalyticsConsent,
  SITE_ANALYTICS_CONSENT_KEY,
  type SiteAnalyticsDelta,
  type SiteAnalyticsRegion,
  type SiteAnalyticsEvent,
  type SiteAnalyticsSource,
  type SiteAcquisitionDelta,
} from "../../lib/site-analytics";

type QueuedDelta = SiteAnalyticsDelta & { pagePath: string };
const ATTRIBUTION_KEY = "edicut-analytics-session-v1";
const PENDING_KEY = "edicut-analytics-pending-v1";
const ENGAGED_SESSION_KEY = "edicut-analytics-engaged-session-v1";
type Attribution = { source: SiteAnalyticsSource; landingPath: string; startedAt: number; completed: SiteAnalyticsEvent[] };

function sessionAttribution(pagePath: string): Attribution {
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_KEY) ?? "null") as Attribution | null;
    if (saved && SITE_ANALYTICS_SOURCES.some((item) => item.id === saved.source) && isSafeSiteAnalyticsLandingPath(saved.landingPath) &&
      typeof saved.startedAt === "number" && Date.now() - saved.startedAt >= 0 && Date.now() - saved.startedAt < 30 * 60_000 &&
      Array.isArray(saved.completed) && saved.completed.every((event) => SITE_ANALYTICS_EVENTS.some((item) => item.id === event))) return saved;
  } catch { /* Storage may be unavailable. Attribution still works for the current page. */ }
  const attribution: Attribution = {
    source: classifySiteAnalyticsSource(document.referrer, window.location.origin, window.location.search),
    landingPath: pagePath,
    startedAt: Date.now(),
    completed: [],
  };
  try { window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution)); } catch { /* Optional storage. */ }
  return attribution;
}

function asRegion(target: EventTarget | null) {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  const region = element?.closest<HTMLElement>("[data-analytics-region]")?.dataset.analyticsRegion;
  return SITE_ANALYTICS_REGIONS.some((item) => item.id === region) ? region as SiteAnalyticsRegion : null;
}

/** Records consented totals and fixed source categories; never records customer fields, URLs with queries, or IDs. */
export function SiteAnalyticsTracker() {
  const [enabled, setEnabled] = useState(false);
  const engagedSessionReported = useRef(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const syncConsent = () => {
      const consent = hasSiteAnalyticsConsent();
      if (!consent) {
        try {
          window.sessionStorage.removeItem(ATTRIBUTION_KEY);
          window.sessionStorage.removeItem(PENDING_KEY);
        } catch { /* Optional storage. */ }
      }
      setSiteAnalyticsConsent(consent);
      setEnabled(consent);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SITE_ANALYTICS_CONSENT_KEY && event.newValue === null) {
        setSiteAnalyticsConsent(false);
        try {
          window.sessionStorage.removeItem(ATTRIBUTION_KEY);
          window.sessionStorage.removeItem(PENDING_KEY);
        } catch { /* Optional storage. */ }
        setEnabled(false);
      } else {
        syncConsent();
      }
    };
    syncConsent();
    window.addEventListener("edicut:consent-change", syncConsent);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("edicut:consent-change", syncConsent);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const queued = new Map<string, QueuedDelta>();
    const acquisition = new Map<string, SiteAcquisitionDelta>();
    const pagePath = pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
    const isPublicPage = isPublicAnalyticsPath(pagePath);
    const attribution = isPublicPage || isConversionOnlyAnalyticsPath(pagePath) ? sessionAttribution(pagePath) : null;
    let activeHover: { region: SiteAnalyticsRegion; pagePath: string; startedAt: number } | null = null;

    const recordEvent = (event: SiteAnalyticsEvent) => {
      if (!attribution || !hasSiteAnalyticsConsent()) return;
      const value = acquisition.get(event) ?? { pagePath, landingPath: attribution.landingPath, source: attribution.source, event, count: 0 };
      value.count = Math.min(value.count + 1, 20);
      acquisition.set(event, value);
    };

    if (isPublicPage) recordEvent("page_view");

    const record = (region: SiteAnalyticsRegion, field: "hoverCount" | "clickCount" | "dwellMs", amount = 1) => {
      const pagePath = window.location.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
      if (!isPublicPage) return;
      const key = `${pagePath}\u0000${region}`;
      const value = queued.get(key) ?? { pagePath, region, hoverCount: 0, clickCount: 0, dwellMs: 0 };
      value[field] += amount;
      queued.set(key, value);
    };

    const finishHover = (now = performance.now()) => {
      if (!activeHover) return;
      const dwell = Math.round(now - activeHover.startedAt);
      if (dwell >= 500) {
        const key = `${activeHover.pagePath}\u0000${activeHover.region}`;
        const value = queued.get(key) ?? { pagePath: activeHover.pagePath, region: activeHover.region, hoverCount: 0, clickCount: 0, dwellMs: 0 };
        value.dwellMs += Math.min(dwell, 120_000);
        queued.set(key, value);
      }
      activeHover = null;
    };

    const flush = (keepalive = false) => {
      if ((!queued.size && !acquisition.size) || !hasSiteAnalyticsConsent()) return;
      const signals = [...acquisition.values()].slice(0, 20);
      for (const item of signals) acquisition.delete(item.event);
      const batch = [...queued.values()].slice(0, 20 - signals.length);
      for (const item of batch) queued.delete(`${item.pagePath}\u0000${item.region}`);
      const body = JSON.stringify({ ...(batch.length ? { events: batch } : {}), ...(signals.length ? { acquisition: signals } : {}) });
      void fetch("/api/site-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive,
        body,
      }).catch(() => undefined);
    };

    const reportEngagedSession = (event: Event) => {
      if (!isPublicPage || !event.isTrusted || navigator.webdriver || document.visibilityState !== "visible" || !hasSiteAnalyticsConsent()) return;
      if (engagedSessionReported.current) return;
      try {
        if (window.sessionStorage.getItem(ENGAGED_SESSION_KEY) === "1") {
          engagedSessionReported.current = true;
          return;
        }
        window.sessionStorage.setItem(ENGAGED_SESSION_KEY, "1");
      } catch { /* The component-level guard still prevents repeat sends without storage. */ }
      engagedSessionReported.current = true;
      void fetch("/api/site-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({ engagedSession: true }),
      }).catch(() => undefined);
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const region = asRegion(event.target);
      if (!region) return;
      const element = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-analytics-region]") : null;
      if (element && event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      const pagePath = window.location.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
      if (!isPublicAnalyticsPath(pagePath)) {
        finishHover();
        return;
      }
      if (activeHover?.region === region && activeHover.pagePath === pagePath) return;
      finishHover();
      record(region, "hoverCount");
      activeHover = { region, pagePath, startedAt: performance.now() };
    };

    const onPointerOut = (event: PointerEvent) => {
      if (!activeHover) return;
      const fromRegion = asRegion(event.target);
      const fromElement = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-analytics-region]") : null;
      if (fromRegion === activeHover.region && !(fromElement && event.relatedTarget instanceof Node && fromElement.contains(event.relatedTarget))) {
        finishHover();
      }
    };

    const onClick = (event: MouseEvent) => {
      const region = asRegion(event.target);
      if (region) record(region, "clickCount");
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (link) {
        try {
          const destination = new URL(link.href, window.location.origin);
          if (destination.origin === window.location.origin && /^\/checkout\/[a-z0-9-]{1,100}$/.test(destination.pathname)) recordEvent("checkout_start");
        } catch { /* Malformed links are not tracked. */ }
      }
    };

    const onSubmit = (event: SubmitEvent) => {
      if (!(event.target instanceof HTMLFormElement) || !attribution || !hasSiteAnalyticsConsent()) return;
      const conversion = event.target.dataset.analyticsForm;
      if ((conversion !== "contact_inquiry" && conversion !== "quote_request") || !event.target.checkValidity() ||
        (conversion === "quote_request" && !isConversionOnlyAnalyticsPath(pagePath)) ||
        (conversion === "contact_inquiry" && !isPublicPage)) return;
      try { window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ event: conversion, pagePath, time: Date.now() })); } catch { /* Cannot confirm a later success without storage. */ }
    };

    const seenSuccessElements = new WeakSet<HTMLElement>();
    const scanSuccessSignals = () => {
      if (!attribution || !hasSiteAnalyticsConsent()) return;
      document.querySelectorAll<HTMLElement>("[data-analytics-event]").forEach((element) => {
        if (seenSuccessElements.has(element)) return;
        seenSuccessElements.add(element);
        const event = element.dataset.analyticsEvent;
        if ((event !== "contact_inquiry" && event !== "quote_request") || attribution.completed.includes(event) ||
          (event === "quote_request" && !isConversionOnlyAnalyticsPath(pagePath)) ||
          (event === "contact_inquiry" && !isPublicPage)) return;
        try {
          const pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) ?? "null") as { event?: string; pagePath?: string; time?: number } | null;
          if (!pending || pending.event !== event || pending.pagePath !== pagePath || typeof pending.time !== "number" || Date.now() - pending.time < 0 || Date.now() - pending.time > 10 * 60_000) return;
          window.sessionStorage.removeItem(PENDING_KEY);
          attribution.completed.push(event);
          window.sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
          recordEvent(event);
          flush();
        } catch { /* Incomplete success signals are not counted. */ }
      });
    };
    const observer = new MutationObserver(scanSuccessSignals);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-analytics-event"] });
    scanSuccessSignals();

    const onPageHide = () => {
      finishHover();
      flush(true);
    };
    const timer = window.setInterval(() => flush(), 30_000);

    document.addEventListener("pointerover", onPointerOver, { passive: true });
    document.addEventListener("pointerout", onPointerOut, { passive: true });
    document.addEventListener("click", onClick, { passive: true });
    document.addEventListener("pointerdown", reportEngagedSession, { passive: true });
    document.addEventListener("keydown", reportEngagedSession, { passive: true });
    document.addEventListener("wheel", reportEngagedSession, { passive: true });
    document.addEventListener("touchstart", reportEngagedSession, { passive: true });
    document.addEventListener("submit", onSubmit);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", reportEngagedSession);
      document.removeEventListener("keydown", reportEngagedSession);
      document.removeEventListener("wheel", reportEngagedSession);
      document.removeEventListener("touchstart", reportEngagedSession);
      document.removeEventListener("submit", onSubmit);
      observer.disconnect();
      window.removeEventListener("pagehide", onPageHide);
      finishHover();
      flush(true);
    };
  }, [enabled, pathname]);

  return null;
}
