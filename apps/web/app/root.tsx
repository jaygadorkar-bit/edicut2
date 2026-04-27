import type { ReactNode } from "react";
import {
  Form,
  Link,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useLoaderData,
  useLocation,
  useRouteError,
} from "react-router";
import stylesheetUrl from "./styles/global.css?url";
import { getCurrentUser } from "./lib/auth.server";
import { resolveWebEnv } from "./lib/context.server";
import type { LoaderContext } from "./types";

export function links() {
  return [{ rel: "stylesheet", href: stylesheetUrl }];
}

export async function loader({
  request,
  context,
}: {
  request: Request;
  context?: LoaderContext;
}) {
  const env = resolveWebEnv(context);
  const user = await getCurrentUser(request, context);

  return {
    appUrl: env.APP_URL,
    nodeApiConfigured: Boolean(env.NODE_API_BASE_URL),
    user: user
      ? {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        }
      : null,
  };
}

export function Layout({ children }: { children: ReactNode }) {
  const data = useLoaderData<typeof loader>() ?? {
    appUrl: "https://edicut.com",
    nodeApiConfigured: false,
    user: null,
  };
  const location = useLocation();
  const isPublicRoute = ["/", "/about", "/portfolio", "/pricing", "/contact"].includes(
    location.pathname
  );

  return (
    <html className={isPublicRoute ? "public-html" : undefined} lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className={isPublicRoute ? "public-body" : undefined}>
        <div className={isPublicRoute ? "shell public-shell" : "shell"}>
          {isPublicRoute ? (
            <header className="site-header-wrap">
              <div className="site-header">
                <Link className="site-brand" to="/">
                  <span className="site-brand-mark">EC</span>
                  <span className="site-brand-text">EdiCut</span>
                </Link>
                <nav className="site-nav">
                  <Link className={location.pathname === "/" ? "active" : ""} to="/">
                    Home
                  </Link>
                  <Link className={location.pathname === "/pricing" ? "active" : ""} to="/pricing">
                    Pricing
                  </Link>
                  <Link
                    className={location.pathname === "/portfolio" ? "active" : ""}
                    to="/portfolio"
                  >
                    Portfolio
                  </Link>
                  <Link className={location.pathname === "/about" ? "active" : ""} to="/about">
                    About
                  </Link>
                  <Link className={location.pathname === "/contact" ? "active" : ""} to="/contact">
                    Contact
                  </Link>
                </nav>
                <div className="site-header-actions">
                  {data.user ? (
                    <>
                      <Link className="ghost-button" to="/dashboard">
                        Dashboard
                      </Link>
                      <Form method="post" action="/logout">
                        <button className="primary-button" type="submit">
                          Sign Out
                        </button>
                      </Form>
                    </>
                  ) : (
                    <>
                      <Link className="ghost-button" to="/login">
                        Sign In
                      </Link>
                      <Link className="primary-button" to="/pricing">
                        Get Started
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </header>
          ) : (
            <header className="topbar">
              <strong className="brand">Edicut</strong>
              <div className="topbar-actions">
                <div className="status-pill">
                  Cloudflare app{" "}
                  {data.nodeApiConfigured ? "with Node API bridge" : "without Node API"}
                </div>
                <nav className="nav-links">
                  <Link to="/">Home</Link>
                  <Link to="/about">About</Link>
                  <Link to="/portfolio">Portfolio</Link>
                  <Link to="/pricing">Pricing</Link>
                  <Link to="/contact">Contact</Link>
                  {data.user ? <Link to="/dashboard">Dashboard</Link> : <Link to="/login">Login</Link>}
                </nav>
                {data.user ? (
                  <Form method="post" action="/logout">
                    <button className="ghost-button" type="submit">
                      Sign Out
                    </button>
                  </Form>
                ) : null}
              </div>
            </header>
          )}
          {children}
          {isPublicRoute ? (
            <footer className="site-footer">
              <div className="site-footer-grid">
                <div>
                  <Link className="site-brand site-brand-footer" to="/">
                    <span className="site-brand-mark">EC</span>
                    <span className="site-brand-text">EdiCut</span>
                  </Link>
                  <p className="site-footer-copy">
                    Editing support for YouTube channels, brand campaigns, and weekly publishing
                    teams that need polished delivery without the usual chaos.
                  </p>
                </div>
                <div>
                  <p className="site-footer-heading">Platform</p>
                  <div className="site-footer-links">
                    <Link to="/">Home</Link>
                    <Link to="/pricing">Pricing</Link>
                    <Link to="/portfolio">Portfolio</Link>
                  </div>
                </div>
                <div>
                  <p className="site-footer-heading">Company</p>
                  <div className="site-footer-links">
                    <Link to="/about">About</Link>
                    <Link to="/contact">Contact</Link>
                    <Link to="/login">Client Access</Link>
                  </div>
                </div>
                <div>
                  <p className="site-footer-heading">Runtime</p>
                  <div className="site-footer-links">
                    <span>{data.nodeApiConfigured ? "Cloudflare + Node bridge" : "Cloudflare only"}</span>
                    <span>{data.user ? `Signed in as ${data.user.email}` : "Anonymous session"}</span>
                    <span>{data.appUrl}</span>
                  </div>
                </div>
              </div>
              <div className="site-footer-meta">
                <p>&copy; {new Date().getFullYear()} EdiCut. All rights reserved.</p>
                <p>Built for faster approvals and cleaner weekly output.</p>
              </div>
            </footer>
          ) : (
            <p className="footer-note">
              Primary origin: {data.appUrl}
              {data.user ? ` · Signed in as ${data.user.email}` : " · Anonymous session"}
            </p>
          )}
        </div>
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
    : "Unexpected application error";
  const message = isRouteErrorResponse(error)
    ? error.data
    : error instanceof Error
      ? error.message
      : "The Cloudflare app hit an unrecoverable error.";

  return (
    <main className="error-shell panel">
      <p className="eyebrow">Cloudflare runtime boundary</p>
      <h1>{title}</h1>
      <p className="lede">{String(message)}</p>
    </main>
  );
}
