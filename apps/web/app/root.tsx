import type { ReactNode } from "react";
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import stylesheetUrl from "./styles/global.css?url";
import { resolveWebEnv } from "./lib/context.server";
import type { LoaderContext } from "./types";

export function links() {
  return [
    { rel: "stylesheet", href: stylesheetUrl },
    { rel: "preconnect", href: "https://fonts.googleapis.com" },
    { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
    { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Roboto:wght@100;300;400;500;700;900&display=swap" },
    { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" }
  ];
}

export async function loader({
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const env = resolveWebEnv(context);

  return {
    appName: "EdiCut",
    appUrl: env.APP_URL ?? "http://localhost:4174",
    nodeApiBaseUrl: env.NODE_API_BASE_URL ?? "http://localhost:8787/api/node",
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
  return (
    <>
      <Outlet />
      <ScrollRestoration />
      <Scripts />
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Application error";
  const message = isRouteErrorResponse(error)
    ? error.data
    : error instanceof Error
      ? error.message
      : "Unexpected error in starter app.";

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold text-red-500">{title}</h1>
      <p className="mt-4">{String(message)}</p>
    </main>
  );
}
