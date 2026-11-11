import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Links,
  Link,
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
  isRouteErrorResponse,
} from "react-router";
import { getAdminNavigationCounts } from "./lib/admin-navigation-counts.server";
import { getAdminProfileImage } from "./lib/admin-profile.server";
import stylesheetUrl from "./styles/global.css?url";
import { resolveWebEnv } from "./lib/context.server";
import type { LoaderContext } from "./types";
import { createSignOutCsrfToken, getAdminSession, getSession } from "./lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./lib/admin-paths";
import { getDbFromContext } from "./lib/db.server";
import { getSiteSettingsSnapshot } from "./lib/site-settings.server";
import { findSeoPageOverride, getSeoAdminSettings } from "./lib/seo-admin.server";
import type { SeoAdminSettings } from "./lib/seo-admin.server";
import { getAdminToolbarAccess, type AdminToolbarAccess } from "./lib/admin-toolbar-access.server";
import { getRecaptchaSiteKey } from "./lib/recaptcha.server";
import { getSupabaseClient } from "./integrations/supabase/client.server";
import { SmoothScroll } from "./components/site/SmoothScroll.js";
import { GoogleTagManager, GoogleTagManagerBootstrap, GoogleTagManagerScript } from "./components/site/GoogleTagManager";
import { shouldEnableSiteMotion, shouldTransitionBetweenRoutes, shouldUseWorkspaceLoader } from "./lib/site-motion";
import { WorkspaceLoadingOverlay } from "./components/WorkspaceLoadingOverlay";
import { shouldLoadPromoBarSettings, shouldLoadRootSiteSettings, shouldShowAdminToolbar } from "./lib/root-data-requirements";
import { getRouteErrorDebugDetails, getRouteErrorPresentation, getSafeRouteErrorDiagnostics } from "./lib/route-error-presentation";
import { getRequestReference } from "./lib/request-reference";
import { scheduleApplicationErrorCapture } from "./lib/application-error-log.server";
import { MATERIAL_SYMBOLS_FONT_URL } from "./lib/material-symbols";
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
const WORKSPACE_LOADING_DELAY_MS = 200;
const AdminToolbar = lazy(() => import("./components/admin/AdminToolbar").then(({ AdminToolbar: component }) => ({ default: component })));
const COOKIE_CONSENT_BOOTSTRAP = `try {
  const saved = localStorage.getItem("edicut-cookie-consent-v1");
  if (saved) {
    const consent = JSON.parse(saved);
    if (consent && typeof consent.analytics === "boolean" && typeof consent.marketing === "boolean") {
      document.documentElement.dataset.edicutConsent = "saved";
    }
  }
} catch {}`;

export function links() {
  return [
    { rel: "preload", href: "/fonts/dm-sans-latin-normal.woff2", as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    { rel: "preload", href: MATERIAL_SYMBOLS_FONT_URL, as: "font", type: "font/woff2", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: stylesheetUrl },
    { rel: "icon", href: "/favicon.ico?v=d8469f69", type: "image/x-icon", sizes: "16x16 32x32 48x48 256x256" },
    { rel: "icon", href: "/favicon.svg?v=31b9f7e0", type: "image/svg+xml", sizes: "any" },
  ];
}

async function loadRoot({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const url = new URL(request.url);
  const isAdminArea = url.pathname.startsWith(ADMIN_BASE_PATH);
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
  const signOutCsrfToken = userId || adminUserId
    ? await createSignOutCsrfToken(cookieHeader, context)
    : null;
  // Reuse the database client within this request; every read still hits its source.
  let rootDb: ReturnType<typeof getDbFromContext> | undefined;
  const getRootDb = () => rootDb ??= getDbFromContext(context ?? {});
  const adminToolbarAccess: AdminToolbarAccess = shouldLoadRootSiteSettings(url.pathname) && (userId || adminUserId)
    ? await getAdminToolbarAccess(getRootDb(), {
      userId,
      userCredentialVersion: session.get("authCredentialVersion"),
      userAccessToken: session.get("supabaseAccessToken"),
      adminUserId,
      adminCredentialVersion: adminSession.get("authCredentialVersion"),
      adminAccessToken: adminSession.get("supabaseAccessToken"),
      verifiedUserAdminId: session.get("adminAccessVerified") === true ? userAdminUserId : undefined,
      verifiedUserAdminCredentialVersion: session.get("adminCredentialVersion"),
    }, context)
    : "none";
  const isAdminSignedIn = adminToolbarAccess === "verified";
  const isAdminPanelPath = url.pathname === ADMIN_BASE_PATH || url.pathname.startsWith(`${ADMIN_BASE_PATH}/`);
  const storedAdminImage = adminSession.get("profileImageUrl");
  const storedAdminEmail = adminSession.get("profileEmail");

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

  // Authorization remains fresh and completes before any privileged reads.
  const shouldLoadSeoSettings = shouldLoadRootSiteSettings(url.pathname) && shouldCheckSeoRoute(url.pathname);
  const defaultSeoSettings: SeoAdminSettings = {
    globalMetadata: { titleTemplate: "%s | EdiCut", defaultDescription: DEFAULT_SEO_DESCRIPTION },
    pageOverrides: [],
    redirects: [],
  };
  const [adminProfile, { pendingOrderCount, unreadEnquiryCount }, siteSettings, seoSettings] = await Promise.all([
    isAdminSignedIn && (isAdminPanelPath || url.pathname === "/dashboard/messages")
      ? getAdminProfileImage(getRootDb(), adminUserId || userAdminUserId).then(profile => profile
        ?? (typeof storedAdminImage === "string" && storedAdminImage.startsWith("https://") && storedAdminImage.length <= 2048 && typeof storedAdminEmail === "string"
          ? { email: storedAdminEmail, imageUrl: storedAdminImage } : null))
      : null,
    isAdminSignedIn && (isAdminPanelPath || url.pathname === "/dashboard/messages") && !isAdminLogin
      ? getAdminNavigationCounts(getRootDb())
      : { pendingOrderCount: 0, unreadEnquiryCount: 0 },
    shouldLoadRootSiteSettings(url.pathname)
      ? getSiteSettingsSnapshot(
          getSupabaseClient(context) ? null : getRootDb(),
          context,
          {
            includeAdminToolbar: isAdminSignedIn,
            includePromoBar: shouldLoadPromoBarSettings(url.pathname),
            includeErrorDiagnostics: isAdminSignedIn,
          },
        )
      : {
        adminToolbarEnabled: false,
        searchCrawlingEnabled: false,
        maintenanceModeEnabled: false,
        errorDiagnosticsEnabled: false,
        promoBarSettings: { enabled: false, message: "" },
      },
    shouldLoadSeoSettings
      ? getSeoAdminSettings(getSupabaseClient(context) ? null : getRootDb(), context).catch(() => {
          console.error("Public SEO settings could not be loaded; built-in metadata will be used.");
          return defaultSeoSettings;
        })
      : defaultSeoSettings,
  ]);

  const redirectPath = url.pathname.replace(/\/+$/, "") || "/";
  const seoRedirect = request.method === "GET" || request.method === "HEAD"
    ? seoSettings.redirects.find((item) => item.enabled && item.from === redirectPath)
    : undefined;
  if (seoRedirect) throw redirect(seoRedirect.to, { status: seoRedirect.status });

  const seoPageOverride = isIndexablePublicPath(url.pathname)
    ? findSeoPageOverride(seoSettings.pageOverrides, url.pathname) ?? null
    : null;
  const { adminToolbarEnabled, searchCrawlingEnabled, maintenanceModeEnabled, errorDiagnosticsEnabled, promoBarSettings } = siteSettings;
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
      && seoPageOverride?.indexable !== false
      ? "index, follow"
      : "noindex, nofollow, noarchive";

  return data({
    appName: "EdiCut",
    requestReference: isAdminSignedIn && errorDiagnosticsEnabled
      ? getRequestReference(request.headers.get("cf-ray"))
      : null,
    appUrl,
    nodeApiBaseUrl: env.NODE_API_BASE_URL ?? "http://localhost:8787/api/node",
    isSignedIn: Boolean(userId),
    isAdminSignedIn,
    signOutCsrfToken,
    workspaceUserIdentity: typeof userId === "string" ? userId : null,
    workspaceAdminIdentity: isAdminSignedIn ? adminUserId || userAdminUserId || null : null,
    adminProfile,
    adminToolbarAccess,
    unreadEnquiryCount,
    pendingOrderCount,
    adminToolbarEnabled,
    searchCrawlingEnabled,
    maintenanceModeEnabled,
    seoTitleTemplate: seoSettings.globalMetadata.titleTemplate,
    seoDefaultDescription: seoSettings.globalMetadata.defaultDescription,
    seoPageOverride,
    promoBarSettings,
    recaptchaSiteKey: getRecaptchaSiteKey(context),
    debugEnabled: isAdminSignedIn && errorDiagnosticsEnabled,
  }, {
    headers: {
      ...(robotsContent ? { "X-Robots-Tag": robotsContent } : {}),
      ...(isAdminSignedIn && (errorDiagnosticsEnabled || isAdminPanelPath || url.pathname === "/dashboard/messages")
        ? { "Cache-Control": "private, no-store" }
        : {}),
    },
  });
}

function shouldCheckSeoRoute(pathname: string) {
  if (/\.(?:avif|css|gif|ico|jpe?g|js|map|mjs|png|svg|ttf|webp|woff2?|xml|txt)$/i.test(pathname)) return false;
  return ![
    "/api",
    "/auth",
    "/checkout",
    "/dashboard",
    "/forgot-password",
    "/maintenance",
    "/signin",
    "/signout",
    "/site",
    "/update-password",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function loader(args: { request: Request; context?: LoaderContext }) {
  try {
    return await loadRoot(args);
  } catch (error) {
    if (error instanceof Response && error.status < 500) throw error;
    const cause = error instanceof Error ? error.cause ?? error : error;
    const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
    const databaseCode = typeof code === "string" && /^(?:[A-Z0-9]{5}|CONNECT_TIMEOUT|CONNECTION_CLOSED|ECONNRESET|ECONNREFUSED|ETIMEDOUT)$/.test(code) ? code : undefined;
    const requestReference = getRequestReference(args.request.headers.get("cf-ray"));
    console.error("Root loader failed.", {
      route: "root",
      requestReference,
      stage: "root-loader",
      status: error instanceof Response ? error.status : 500,
      errorType: cause instanceof Error ? cause.name : cause instanceof Response ? "Response" : "UnknownError",
      ...(databaseCode ? { databaseCode } : {}),
    });
    scheduleApplicationErrorCapture(args.context, args.request, cause);
    throw data({ diagnostics: {
      requestReference,
      route: "root",
      stage: "root-loader",
      status: error instanceof Response ? error.status : 500,
      errorType: cause instanceof Error ? cause.name : cause instanceof Response ? "Response" : "UnknownError",
      ...(databaseCode ? { databaseCode } : {}),
    } }, { status: error instanceof Response ? error.status : 500 });
  }
}

export const meta: MetaFunction<typeof loader> = ({ loaderData: rootData, location, error }) => {
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return createPageMeta(
    notFound ? "Page not found | EdiCut" : DEFAULT_SEO_TITLE,
    notFound ? "The EdiCut page you requested could not be found." : DEFAULT_SEO_DESCRIPTION,
    {
      appUrl: rootData?.appUrl,
      pathname: location.pathname,
      crawlingEnabled: rootData?.searchCrawlingEnabled !== false && error == null,
      maintenanceModeEnabled: rootData?.maintenanceModeEnabled === true,
      titleTemplate: rootData?.seoTitleTemplate,
      defaultDescription: rootData?.seoDefaultDescription,
      pageOverride: rootData?.seoPageOverride,
    },
  );
};

export const headers: HeadersFunction = ({ loaderHeaders, parentHeaders, errorHeaders }) => {
  const headers = new Headers(parentHeaders);
  loaderHeaders.forEach((value, key) => headers.set(key, value));
  if (errorHeaders) headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  return headers;
};

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <GoogleTagManagerBootstrap />
        <GoogleTagManagerScript />
        <Meta />
        <script dangerouslySetInnerHTML={{ __html: COOKIE_CONSENT_BOOTSTRAP }} />
        <Links />
      </head>
      <body className="antialiased overflow-x-hidden">
        {children}
        <Scripts />
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
  const includeStructuredData = location.pathname === "/" && shouldIndexPage({
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
  // Fetchers have local feedback and must not interrupt the entire workspace.
  const workspacePending = shouldUseWorkspaceLoader(location.pathname) && navigation.state !== "idle" && !navigationStalled;
  const [workspaceLoaderReady, setWorkspaceLoaderReady] = useState(false);
  const showWorkspaceLoader = workspacePending && workspaceLoaderReady;

  useEffect(() => {
    if (!workspacePending) {
      setWorkspaceLoaderReady(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setWorkspaceLoaderReady(true);
    }, WORKSPACE_LOADING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [workspacePending]);

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
      <GoogleTagManager pathname={location.pathname} pendingPathname={navigation.location?.pathname} />
      {useSiteMotion ? <SmoothScroll /> : null}
      <div className={`neo-app-shell${showAdminToolbar ? " neo-app-shell--admin-toolbar" : ""}`}
        aria-busy={workspacePending || undefined}>
        {showAdminToolbar ? <Suspense fallback={null}><AdminToolbar /></Suspense> : null}
        <Outlet />
        {useSiteMotion ? <PageTransition navigationStalled={navigationStalled} /> : null}
      </div>
      {showWorkspaceLoader ? <WorkspaceLoadingOverlay /> : null}
      {includeStructuredData ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData }} />
      ) : null}
      {navigationStalled ? <NavigationRecovery /> : null}
      {data.recaptchaSiteKey ? <span hidden data-edicut-recaptcha-site-key={data.recaptchaSiteKey} /> : null}
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
      if (!shouldTransitionBetweenRoutes(currentUrl.pathname, nextUrl.pathname)) return;
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
      if (
        startedAt.current === null &&
        navigation.location &&
        shouldTransitionBetweenRoutes(location.pathname, navigation.location.pathname) &&
        isPageChange(location, navigation.location)
      ) {
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
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;

  const rootData = useRouteLoaderData("root") as { debugEnabled?: boolean; requestReference?: string | null } | undefined;
  const presentation = getRouteErrorPresentation(error);
  const debugEnabled = import.meta.env.DEV || rootData?.debugEnabled === true;
  const diagnostics = debugEnabled ? getSafeRouteErrorDiagnostics(error) : null;
  const requestReference = diagnostics?.requestReference ?? rootData?.requestReference ?? null;
  const debugDetails = debugEnabled ? getRouteErrorDebugDetails(error) : null;

  return (
    <main className="mx-auto flex min-h-[75vh] max-w-4xl items-center px-5 py-12 sm:px-8">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-10" role="alert">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{presentation.label}</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">{presentation.title}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">{presentation.message}</p>
        {debugEnabled && (requestReference || diagnostics) ? (
          <section className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" aria-label="Safe diagnostic information">
            <p className="text-xs font-black uppercase tracking-widest text-slate-500">Diagnostic information</p>
            <dl className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-[max-content_1fr]">
              <dt className="font-bold">Request reference</dt>
              <dd><code className="select-all break-all">{requestReference ?? "Unavailable"}</code></dd>
              {diagnostics ? <>
                <dt className="font-bold">Route</dt><dd><code>{diagnostics.route}</code></dd>
                <dt className="font-bold">Failure stage</dt><dd><code>{diagnostics.stage}</code></dd>
                <dt className="font-bold">HTTP status</dt><dd><code>{diagnostics.status}</code></dd>
                <dt className="font-bold">Error type</dt><dd><code>{diagnostics.errorType}</code></dd>
                {diagnostics.databaseCode ? <><dt className="font-bold">Database code</dt><dd><code>{diagnostics.databaseCode}</code></dd></> : null}
              </> : null}
            </dl>
            <p className="mt-3 text-xs leading-5 text-slate-600">Share this reference with EdiCut support to find the matching server log. Private account and query data are not shown here.</p>
          </section>
        ) : null}
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

function NotFoundPage() {
  return (
    <main className="neo-home neo-not-found" aria-labelledby="not-found-title">
      <div className="neo-not-found__content">
        <p className="neo-not-found__number" aria-hidden="true">404</p>
        <h1 id="not-found-title" className="neo-not-found__title">Page not found</h1>
        <Link to="/" className="neo-not-found__button">Go to homepage</Link>
      </div>
    </main>
  );
}
