import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  data,
  redirect,
  type HeadersFunction,
  type MetaFunction,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useFetchers,
  useRouteLoaderData,
  useRouteError,
} from "react-router";
import stylesheetUrl from "./styles/global.css?url";
import { resolveWebEnv } from "./lib/context.server";
import type { LoaderContext } from "./types";
import { getAdminSession, getSession } from "./lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./lib/admin-paths";
import { getDbFromContext } from "./lib/db.server";
import { getSiteSettingsSnapshot } from "./lib/site-settings.server";
import { AdminToolbar } from "./components/admin/AdminToolbar";
import { getRecaptchaSiteKey } from "./lib/recaptcha.server";
import { getSupabaseClient } from "./integrations/supabase/client.server";
import { SmoothScroll } from "./components/site/SmoothScroll.js";
import { shouldEnableSiteMotion } from "./lib/site-motion";
import { shouldLoadPromoBarSettings, shouldLoadRootSiteSettings, shouldShowAdminToolbar } from "./lib/root-data-requirements";
import { getRouteErrorDebugDetails, getRouteErrorPresentation } from "./lib/route-error-presentation";
import { getMaterialSymbolsStylesheetUrl } from "./lib/material-symbols";
import {
  createPageMeta,
  createSiteStructuredData,
  DEFAULT_SEO_DESCRIPTION,
  DEFAULT_SEO_TITLE,
  isIndexablePublicPath,
  serializeJsonLd,
  shouldIndexPage,
} from "./lib/seo";

const usePageTransitionLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
const PAGE_TRANSITION_COVER_MS = 860;
const PAGE_TRANSITION_REVEAL_MS = 920;
const NAVIGATION_STALL_NOTICE_MS = 15_000;

export function links() {
  return [
    { rel: "stylesheet", href: stylesheetUrl },
    { rel: "preload", href: "/fonts/dm-sans-latin-normal.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "icon", href: "/favicon.ico", type: "image/svg+xml" },
    { rel: "stylesheet", href: getMaterialSymbolsStylesheetUrl() }
  ];
}

export async function loader({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const url = new URL(request.url);
  const legacyAuthMode = url.searchParams.get("auth");
  if (url.pathname === "/" && (legacyAuthMode === "signin" || legacyAuthMode === "signup")) {
    const params = new URLSearchParams({ mode: legacyAuthMode });
    const legacyRedirectTo = url.searchParams.get("redirectTo");
    if (legacyRedirectTo) params.set("redirectTo", legacyRedirectTo);
    throw redirect(`/signin?${params.toString()}`);
  }

  const env = resolveWebEnv(context);
  const cookieHeader = request.headers.get("Cookie");
  const [session, adminSession] = await Promise.all([
    getSession(cookieHeader, context),
    getAdminSession(cookieHeader, context),
  ]);
  const userId = session.get("userId");
  const adminUserId = adminSession.get("adminUserId");
  const userAdminUserId = session.get("adminUserId");
  const isAdminSignedIn =
    (typeof adminUserId === "string" && adminUserId.length > 0) ||
    (typeof userAdminUserId === "string" && userAdminUserId.length > 0 && session.get("adminAccessVerified") === true);

  const isAdminArea = url.pathname.startsWith(ADMIN_BASE_PATH);
  const isAdminLogin = url.pathname === ADMIN_LOGIN_PATH;
  const isMaintenancePage = url.pathname === "/maintenance";
  const isAuthenticationRoute =
    url.pathname === "/auth/google" ||
    url.pathname === "/api/auth/callback/google" ||
    url.pathname === "/signin" ||
    url.pathname === "/forgot-password" ||
    url.pathname === "/update-password" ||
    (url.pathname === "/" && url.searchParams.get("auth") === "signin");
  const isInfrastructureRoute =
    url.pathname === "/health" ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/robots.txt" ||
    url.pathname === "/sitemap.xml";

  const siteSettings = shouldLoadRootSiteSettings(url.pathname)
    ? await getSiteSettingsSnapshot(
        getSupabaseClient(context) ? null : getDbFromContext(context ?? {}),
        context,
        {
          includeAdminToolbar: isAdminSignedIn,
          includePromoBar: shouldLoadPromoBarSettings(url.pathname),
        },
      )
    : {
        adminToolbarEnabled: false,
        searchCrawlingEnabled: false,
        maintenanceModeEnabled: false,
        promoBarSettings: { enabled: false, message: "" },
      };
  const { adminToolbarEnabled, searchCrawlingEnabled, maintenanceModeEnabled, promoBarSettings } = siteSettings;
  const appUrl = env.APP_URL ?? "http://localhost:3002";

  const maintenanceBlocksRequest =
    maintenanceModeEnabled &&
    !isAdminSignedIn &&
    !isAdminArea &&
    !isAdminLogin &&
    !isAuthenticationRoute &&
    !isMaintenancePage &&
    !isInfrastructureRoute;

  if (maintenanceBlocksRequest) {
    throw redirect(`/maintenance?redirectTo=${encodeURIComponent(`${url.pathname}${url.search}`)}`);
  }

  const isCrawlerResource = url.pathname === "/robots.txt" || url.pathname === "/sitemap.xml";
  const robotsContent = isCrawlerResource
    ? null
    : shouldIndexPage({
        pathname: url.pathname,
        crawlingEnabled: searchCrawlingEnabled,
        maintenanceModeEnabled: maintenanceModeEnabled || isMaintenancePage,
        appUrl,
      })
      ? "index, follow"
      : "noindex, nofollow, noarchive";

  return data({
    appName: "EdiCut",
    appUrl,
    nodeApiBaseUrl: env.NODE_API_BASE_URL ?? "http://localhost:8787/api/node",
    isSignedIn: Boolean(userId),
    isAdminSignedIn,
    adminToolbarEnabled,
    searchCrawlingEnabled,
    maintenanceModeEnabled,
    promoBarSettings,
    recaptchaSiteKey: getRecaptchaSiteKey(context),
    debugEnabled: env.DEBUG_MODE === "true" && (env.APP_URL?.includes("localhost") || isAdminSignedIn),
  }, {
    headers: {
      ...(robotsContent ? { "X-Robots-Tag": robotsContent } : {}),
    },
  });
}

export const meta: MetaFunction<typeof loader> = ({ data: rootData, location }) => {
  return createPageMeta(DEFAULT_SEO_TITLE, DEFAULT_SEO_DESCRIPTION, {
    appUrl: rootData?.appUrl,
    pathname: location.pathname,
    crawlingEnabled: rootData?.searchCrawlingEnabled !== false,
    maintenanceModeEnabled: rootData?.maintenanceModeEnabled === true,
  });
};

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders }) => {
  const headers = new Headers(parentHeaders);
  loaderHeaders.forEach((value, key) => headers.set(key, value));
  return headers;
};

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="antialiased overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}

export default function AppRoot() {
  const data = useLoaderData<typeof loader>();
  const location = useLocation();
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const showAdminToolbar = shouldShowAdminToolbar(location.pathname, data.isAdminSignedIn, data.adminToolbarEnabled);
  const includeStructuredData = shouldIndexPage({
    pathname: location.pathname,
    crawlingEnabled: data.searchCrawlingEnabled,
    maintenanceModeEnabled: data.maintenanceModeEnabled,
    appUrl: data.appUrl,
  });
  const structuredData = serializeJsonLd(createSiteStructuredData(data.appUrl));
  const useSiteMotion = shouldEnableSiteMotion(location.pathname);
  const navigationKey = navigation.state === "idle"
    ? ""
    : `navigation:${navigation.state}:${navigation.location?.pathname ?? location.pathname}${navigation.location?.search ?? ""}`;
  const fetcherKey = fetchers
    .filter((fetcher) => fetcher.state !== "idle")
    .map((fetcher) => `${fetcher.key}:${fetcher.state}`)
    .sort()
    .join("|");
  const pendingOperationsKey = [navigationKey, fetcherKey].filter(Boolean).join("|");
  const hasPendingOperations = pendingOperationsKey.length > 0;
  const [navigationStalled, setNavigationStalled] = useState(false);

  useEffect(() => {
    if (!hasPendingOperations) {
      setNavigationStalled(false);
      return;
    }

    setNavigationStalled(false);
    const timer = window.setTimeout(() => setNavigationStalled(true), NAVIGATION_STALL_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [hasPendingOperations, pendingOperationsKey]);

  return (
    <>
      {useSiteMotion ? <SmoothScroll /> : null}
      <div className={`neo-app-shell${showAdminToolbar ? " neo-app-shell--admin-toolbar" : ""}`}>
        {showAdminToolbar ? <AdminToolbar /> : null}
        <Outlet />
        {useSiteMotion ? <PageTransition navigationStalled={navigationStalled} /> : null}
      </div>
      {includeStructuredData ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      ) : null}
      {navigationStalled ? <NavigationRecovery /> : null}
      {data.recaptchaSiteKey && isIndexablePublicPath(location.pathname) ? (
        <script
          src="https://www.google.com/recaptcha/api.js?render=explicit"
          async
          defer
          data-edicut-recaptcha-site-key={data.recaptchaSiteKey}
        />
      ) : null}
      <Scripts />
    </>
  );
}

function isPageChange(
  from: { pathname: string; search: string },
  to: { pathname: string; search: string },
) {
  return from.pathname !== to.pathname || from.search !== to.search;
}

function PageTransition({ navigationStalled }: { navigationStalled: boolean }) {
  const navigation = useNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"idle" | "covering" | "revealing">("idle");
  const startedAt = useRef<number | null>(null);
  const previousLocation = useRef({
    key: location.key,
    pathname: location.pathname,
    search: location.search,
  });
  const pendingNavigation = useRef<string | null>(null);
  const navigationTimer = useRef<number | null>(null);
  const exitTimer = useRef<number | null>(null);
  const cleanupTimer = useRef<number | null>(null);

  const clearTimers = () => {
    if (navigationTimer.current !== null) window.clearTimeout(navigationTimer.current);
    if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    if (cleanupTimer.current !== null) window.clearTimeout(cleanupTimer.current);
    navigationTimer.current = null;
    exitTimer.current = null;
    cleanupTimer.current = null;
  };

  const beginCover = () => {
    clearTimers();
    startedAt.current = Date.now();
    setPhase("covering");
  };

  const revealAfterCover = () => {
    if (exitTimer.current !== null || cleanupTimer.current !== null) return;

    const elapsed = startedAt.current === null ? 0 : Date.now() - startedAt.current;
    const delay = Math.max(0, PAGE_TRANSITION_COVER_MS - elapsed);

    exitTimer.current = window.setTimeout(() => {
      exitTimer.current = null;
      setPhase("revealing");
      cleanupTimer.current = window.setTimeout(() => {
        cleanupTimer.current = null;
        startedAt.current = null;
        setPhase("idle");
      }, PAGE_TRANSITION_REVEAL_MS);
    }, delay);
  };

  useEffect(() => {
    const interceptInternalLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a");
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;

      const nextUrl = new URL(anchor.href, window.location.href);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.origin !== currentUrl.origin) return;
      if (!shouldEnableSiteMotion(currentUrl.pathname) || !shouldEnableSiteMotion(nextUrl.pathname)) return;
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
        if (nextUrl.hash !== currentUrl.hash) return;

        event.preventDefault();
        if (nextUrl.hash) {
          if (window.__lenis) {
            window.__lenis.scrollTo(nextUrl.hash, { immediate: true });
          } else {
            document.getElementById(decodeURIComponent(nextUrl.hash.slice(1)))?.scrollIntoView();
          }
        } else {
          window.location.reload();
        }
        return;
      }

      event.preventDefault();
      if (pendingNavigation.current !== null) return;

      pendingNavigation.current = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      beginCover();
      navigationTimer.current = window.setTimeout(() => {
        const targetUrl = pendingNavigation.current;
        pendingNavigation.current = null;
        navigationTimer.current = null;
        if (targetUrl !== null) navigate(targetUrl);
      }, PAGE_TRANSITION_COVER_MS);
    };

    document.addEventListener("click", interceptInternalLink, true);
    return () => document.removeEventListener("click", interceptInternalLink, true);
  }, [navigate]);

  usePageTransitionLayoutEffect(() => {
    if (navigation.state === "loading") {
      if (startedAt.current === null && navigation.location && isPageChange(location, navigation.location)) {
        beginCover();
      }
      return;
    }

    if (navigation.state !== "idle" || startedAt.current === null) return;

    revealAfterCover();
  }, [location.pathname, location.search, navigation.location, navigation.state]);

  usePageTransitionLayoutEffect(() => {
    if (previousLocation.current.key === location.key) return;

    const previous = previousLocation.current;
    previousLocation.current = {
      key: location.key,
      pathname: location.pathname,
      search: location.search,
    };

    if (!isPageChange(previous, location)) return;
    if (startedAt.current === null) beginCover();
    if (navigation.state === "idle") revealAfterCover();
  }, [location.key, location.pathname, location.search, navigation.state]);

  useEffect(() => {
    if (navigationStalled && startedAt.current !== null) revealAfterCover();
  }, [navigationStalled]);

  useEffect(() => () => {
    clearTimers();
  }, []);

  if (phase === "idle") return null;

  return (
    <div className="page-transition" data-phase={phase} role="status" aria-live="polite" aria-label="Loading EdiCut">
      <div className="page-transition__panel" aria-hidden="true">
        <div className="page-transition__cap page-transition__cap--top">
          <svg
            className="page-transition__cap-svg"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
          >
            <path
              className="page-transition__cap-fill page-transition__cap-fill--top"
              d="M -5 100 Q 500 0 1005 100 Z"
            />
            <path
              className="page-transition__edge page-transition__edge--shadow"
              d="M -5 101 Q 500 1.5 1005 101"
            />
            <path
              className="page-transition__edge page-transition__edge--top"
              d="M -5 100 Q 500 0 1005 100"
            />
          </svg>
        </div>

        <div className="page-transition__cap page-transition__cap--bottom">
          <svg
            className="page-transition__cap-svg"
            viewBox="0 0 1000 100"
            preserveAspectRatio="none"
          >
            <path
              className="page-transition__cap-fill page-transition__cap-fill--bottom"
              d="M -5 0 Q 500 100 1005 0 Z"
            />
            <path
              className="page-transition__edge page-transition__edge--shadow"
              d="M -5 -1 Q 500 98.5 1005 -1"
            />
            <path
              className="page-transition__edge page-transition__edge--bottom"
              d="M -5 0 Q 500 100 1005 0"
            />
          </svg>
        </div>

        <span className="page-transition__word">
          <img src="/icons/edicut-logo.svg" alt="" className="page-transition__logo" />
        </span>
      </div>
    </div>
  );
}

function NavigationRecovery() {
  return (
    <aside className="neo-navigation-recovery" role="alert" aria-live="assertive">
      <div className="neo-navigation-recovery__card">
        <p className="neo-navigation-recovery__title">This is taking longer than expected</p>
        <p className="neo-navigation-recovery__message">
          The request may still be processing. Check the result before submitting the same change again.
        </p>
        <div className="neo-navigation-recovery__actions">
          <a href="/signin?mode=signin">Open sign in</a>
          <button type="button" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    </aside>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const rootData = useRouteLoaderData("root") as { debugEnabled?: boolean } | undefined;
  const presentation = getRouteErrorPresentation(error);
  const debugEnabled = import.meta.env.DEV || rootData?.debugEnabled === true;
  const debugDetails = debugEnabled ? getRouteErrorDebugDetails(error) : null;

  return (
    <main className="mx-auto flex min-h-[75vh] max-w-4xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10" role="alert">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{presentation.label}</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{presentation.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{presentation.message}</p>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Try again
          </button>
          <a className="rounded-full border border-slate-300 px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" href="/">
            Go to home
          </a>
          <a className="rounded-full px-3 py-3 text-sm font-bold text-slate-600 underline underline-offset-4 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900" href="/signin?mode=signin">
            Sign in
          </a>
        </div>
        {debugEnabled ? (
          <section className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
            <p className="text-xs font-black uppercase tracking-widest">Debug details</p>
            <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">{debugDetails}</pre>
          </section>
        ) : null}
      </section>
    </main>
  );
}
