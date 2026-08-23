import type { ReactNode } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useRouteLoaderData,
  useRouteError,
} from "react-router";
import stylesheetUrl from "./styles/global.css?url";
import { resolveWebEnv } from "./lib/context.server";
import type { LoaderContext } from "./types";
import { getAdminSession, getSession } from "./lib/session.server";
import { ADMIN_BASE_PATH } from "./lib/admin-paths";
import { getDbFromContext } from "./lib/db.server";
import { getAdminToolbarEnabled, getPromoBarSettings } from "./lib/site-settings.server";
import { AdminToolbar } from "./components/admin/AdminToolbar";
import { AuthModal } from "./components/auth/AuthModal";
import { getRecaptchaSiteKey } from "./lib/recaptcha.server";
import { getSupabaseClient } from "./integrations/supabase/client.server";

export function links() {
  return [
    { rel: "stylesheet", href: stylesheetUrl },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "icon", href: "/favicon.ico", type: "image/svg+xml" },
    { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" },
    { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" }
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
  const adminToolbarEnabled = isAdminSignedIn
    ? await getAdminToolbarEnabled(db, context)
    : false;
  
  const promoBarSettings = await getPromoBarSettings(db, context);

  return {
    appName: "EdiCut",
    appUrl: env.APP_URL ?? "http://localhost:3000",
    nodeApiBaseUrl: env.NODE_API_BASE_URL ?? "http://localhost:8787/api/node",
    isSignedIn: Boolean(userId),
    isAdminSignedIn,
    adminToolbarEnabled,
    promoBarSettings,
    recaptchaSiteKey: getRecaptchaSiteKey(context),
    debugEnabled: env.DEBUG_MODE === "true" && (env.APP_URL?.includes("localhost") || isAdminSignedIn),
  };
}

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
      <body className="antialiased">
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
      <Outlet />
      <AuthModal />
      {data.isAdminSignedIn && data.adminToolbarEnabled && !isAdminArea ? <AdminToolbar /> : null}
      {data.recaptchaSiteKey ? (
        <script
          src="https://www.google.com/recaptcha/api.js?render=explicit"
          async
          defer
          data-edicut-recaptcha-site-key={data.recaptchaSiteKey}
        />
      ) : null}
      <ScrollRestoration />
      <Scripts />
    </>
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
