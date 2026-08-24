import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  isRouteErrorResponse,
  data,
  redirect,
  type HeadersFunction,
  type MetaFunction,
  useLoaderData,
  useLocation,
  useNavigate,
  useNavigation,
  useRouteLoaderData,
  useRouteError,
} from "react-router";
import stylesheetUrl from "./styles/global.css?url";
import { resolveWebEnv } from "./lib/context.server";
import type { LoaderContext } from "./types";
import { getAdminSession, getSession } from "./lib/session.server";
import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./lib/admin-paths";
import { getDbFromContext } from "./lib/db.server";
import {
  getAdminToolbarEnabled,
  getMaintenanceModeEnabled,
  getPromoBarSettings,
  getSearchCrawlingEnabled,
} from "./lib/site-settings.server";
import { AdminToolbar } from "./components/admin/AdminToolbar";
import { getRecaptchaSiteKey } from "./lib/recaptcha.server";
import { getSupabaseClient } from "./integrations/supabase/client.server";
import { SmoothScroll } from "./components/site/SmoothScroll.js";

const usePageTransitionLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;
const PAGE_TRANSITION_COVER_MS = 860;
const PAGE_TRANSITION_REVEAL_MS = 920;

export function links() {
  return [
    { rel: "stylesheet", href: stylesheetUrl },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "icon", href: "/favicon.ico", type: "image/svg+xml" },
    { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block" }
  ];
}

export async function loader({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const env = resolveWebEnv(context);
  const session = await getSession(request.headers.get("Cookie"), context);
  const adminSession = await getAdminSession(request.headers.get("Cookie"), context);
  const userId = session.get("userId");
  const adminUserId = adminSession.get("adminUserId");
  const userAdminUserId = session.get("adminUserId");
  const isAdminSignedIn =
    (typeof adminUserId === "string" && adminUserId.length > 0) ||
    (typeof userAdminUserId === "string" && userAdminUserId.length > 0);
  const db = getSupabaseClient(context) ? null : getDbFromContext(context ?? {});
  const [adminToolbarEnabled, searchCrawlingEnabled, maintenanceModeEnabled, promoBarSettings] = await Promise.all([
    isAdminSignedIn ? getAdminToolbarEnabled(db, context) : Promise.resolve(false),
    getSearchCrawlingEnabled(db, context),
    getMaintenanceModeEnabled(db, context),
    getPromoBarSettings(db, context),
  ]);
  const url = new URL(request.url);
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
    url.pathname === "/robots.txt";

  const legacyAuthMode = url.searchParams.get("auth");
  if (url.pathname === "/" && (legacyAuthMode === "signin" || legacyAuthMode === "signup")) {
    const params = new URLSearchParams({ mode: legacyAuthMode });
    const legacyRedirectTo = url.searchParams.get("redirectTo");
    if (legacyRedirectTo) params.set("redirectTo", legacyRedirectTo);
    throw redirect(`/signin?${params.toString()}`);
  }

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

  const robotsContent =
    !searchCrawlingEnabled || maintenanceModeEnabled || isMaintenancePage
      ? "noindex, nofollow, noarchive"
      : "index, follow";

  return data({
    appName: "EdiCut",
    appUrl: env.APP_URL ?? "http://localhost:3000",
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
      "X-Robots-Tag": robotsContent,
    },
  });
}

export const meta: MetaFunction<typeof loader> = ({ data: rootData }) => [
  {
    name: "robots",
    content: rootData?.searchCrawlingEnabled === false || rootData?.maintenanceModeEnabled
      ? "noindex, nofollow, noarchive"
      : "index, follow",
  },
];

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
        <title>EdiCut | Minimalist Video Editing for YouTubers</title>
        <meta name="description" content="Clean, modern, and high-performance video editing tailored for the next generation of creators." />
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
  const isAdminArea = location.pathname.startsWith(ADMIN_BASE_PATH);

  return (
    <>
      <SmoothScroll />
      <Outlet />
      <PageTransition />
      {data.isAdminSignedIn && data.adminToolbarEnabled && !isAdminArea ? <AdminToolbar /> : null}
      {data.recaptchaSiteKey ? (
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

function PageTransition() {
  const navigation = useNavigation();
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"idle" | "covering" | "revealing">("idle");
  const startedAt = useRef<number | null>(null);
  const previousLocationKey = useRef(location.key);
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
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) return;

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
      if (startedAt.current === null) beginCover();
      return;
    }

    if (navigation.state !== "idle" || startedAt.current === null) return;

    revealAfterCover();
  }, [navigation.state]);

  usePageTransitionLayoutEffect(() => {
    if (previousLocationKey.current === location.key) return;

    previousLocationKey.current = location.key;
    if (startedAt.current === null) beginCover();
    if (navigation.state === "idle") revealAfterCover();
  }, [location.key, navigation.state]);

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

export function ErrorBoundary() {
  const error = useRouteError();
  const rootData = useRouteLoaderData("root") as { debugEnabled?: boolean } | undefined;
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Application error";
  const message = isRouteErrorResponse(error)
    ? error.data
    : error instanceof Error
      ? error.message
      : "Unexpected error in starter app.";
  const debugEnabled = import.meta.env.DEV || rootData?.debugEnabled === true;
  const stack = debugEnabled && error instanceof Error ? error.stack : null;

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-red-500">{title}</h1>
      <p className="mt-4">{String(message)}</p>
      {debugEnabled ? (
        <section className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p className="text-xs font-black uppercase tracking-widest">Debug mode enabled</p>
          {error instanceof Error ? (
            <dl className="mt-3 grid gap-2 text-sm">
              <div><dt className="inline font-bold">Error: </dt><dd className="inline">{error.name}</dd></div>
              <div><dt className="inline font-bold">Message: </dt><dd className="inline break-words">{error.message}</dd></div>
            </dl>
          ) : null}
        </section>
      ) : null}
      {stack ? (
        <pre className="mt-6 overflow-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
          {stack}
        </pre>
      ) : null}
    </main>
  );
}
