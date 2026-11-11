import { useEffect, useRef } from "react";
import { isPublicAnalyticsPath } from "../../lib/site-analytics";

const GOOGLE_TAG_MANAGER_ID = "GTM-MFT59BNH";
const GOOGLE_TAG_MANAGER_URL = `https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_MANAGER_ID}`;
const GOOGLE_TAG_MANAGER_BOOTSTRAP =
  "window.dataLayer = window.dataLayer || [];\n" +
  "function gtag(){dataLayer.push(arguments);}\n" +
  "gtag('js', new Date());";
const GOOGLE_TAG_MANAGER_SCRIPT = "script[data-edicut-google-tag-manager]";

const REVOKED_CONSENT = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
};
const RESTORED_CONSENT = {
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
  analytics_storage: "granted",
};

type GoogleTagCommand = (...args: unknown[]) => void;
type GoogleTagWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: GoogleTagCommand;
};

function normalizePublicPath(pathname: string) {
  return pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}

function isGoogleTagManagerPage(pathname: string) {
  const path = normalizePublicPath(pathname);
  if (path === "/maintenance") return false;
  return isPublicAnalyticsPath(path) || path === "/blog" || /^\/blog\/[a-z0-9-]{1,100}$/.test(path);
}

function ensureGoogleTagQueue() {
  const tagWindow = window as GoogleTagWindow;
  tagWindow.dataLayer ??= [];
  if (!tagWindow.gtag) {
    tagWindow.gtag = function gtag() {
      tagWindow.dataLayer?.push(arguments);
    };
    tagWindow.gtag("js", new Date());
  }
  return tagWindow.gtag;
}

function loadGoogleTagManagerScript() {
  const script = document.querySelector<HTMLScriptElement>(GOOGLE_TAG_MANAGER_SCRIPT);
  if (!script || script.hasAttribute("src")) return;

  script.async = true;
  script.src = GOOGLE_TAG_MANAGER_URL;
}

/** Sets up Google's queue in the document head before the async container script runs. */
export function GoogleTagManagerBootstrap() {
  return <script data-edicut-google-tag-bootstrap="true" dangerouslySetInnerHTML={{ __html: GOOGLE_TAG_MANAGER_BOOTSTRAP }} />;
}

/** Keeps a stable head node for React Router while the public-page effect enables GTM. */
export function GoogleTagManagerScript() {
  return <script data-edicut-google-tag-manager="true" />;
}

function syncGoogleTagRoute(pathname: string, previousRouteIsPublic: { current: boolean }) {
  const routeIsPublic = isGoogleTagManagerPage(pathname);
  const scriptIsLoaded = document.querySelector<HTMLScriptElement>(GOOGLE_TAG_MANAGER_SCRIPT)?.hasAttribute("src") === true;
  if (!scriptIsLoaded && !routeIsPublic) {
    previousRouteIsPublic.current = false;
    return;
  }

  const gtag = ensureGoogleTagQueue();
  if (scriptIsLoaded && previousRouteIsPublic.current !== routeIsPublic) {
    gtag("consent", "update", routeIsPublic ? RESTORED_CONSENT : REVOKED_CONSENT);
  }
  if (routeIsPublic) {
    gtag("set", { page_location: window.location.origin + normalizePublicPath(pathname) });
  }
  previousRouteIsPublic.current = routeIsPublic;
}

/** Installs GTM on public pages without waiting for the site's cookie choice. */
export function GoogleTagManager({ pathname, pendingPathname }: { pathname: string; pendingPathname?: string }) {
  const routeIsPublic = isGoogleTagManagerPage(pathname);
  const previousRouteIsPublic = useRef(routeIsPublic);

  useEffect(() => {
    const sync = () => {
      const nextPathname = pendingPathname ?? pathname;
      if (isGoogleTagManagerPage(nextPathname)) loadGoogleTagManagerScript();
      syncGoogleTagRoute(nextPathname, previousRouteIsPublic);
    };
    const onInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;

      const currentUrl = new URL(window.location.href);
      const nextUrl = new URL(anchor.href, currentUrl);
      if (nextUrl.origin === currentUrl.origin) syncGoogleTagRoute(nextUrl.pathname, previousRouteIsPublic);
    };
    const onHistoryNavigation = () => syncGoogleTagRoute(window.location.pathname, previousRouteIsPublic);

    sync();
    window.addEventListener("popstate", onHistoryNavigation, true);
    document.addEventListener("click", onInternalNavigation, true);
    return () => {
      window.removeEventListener("popstate", onHistoryNavigation, true);
      document.removeEventListener("click", onInternalNavigation, true);
    };
  }, [pathname, pendingPathname]);

  return null;
}
