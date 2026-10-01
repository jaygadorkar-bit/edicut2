import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./admin-paths";

const ROUTES_WITHOUT_PROMO_SETTINGS = [
  ADMIN_BASE_PATH,
  ADMIN_LOGIN_PATH,
  "/dashboard",
  "/signin",
  "/forgot-password",
  "/update-password",
  "/auth",
  "/api",
  "/checkout",
  "/maintenance",
  "/health",
  "/favicon.ico",
  "/robots.txt",
];

const ROUTES_WITHOUT_ROOT_SETTINGS = [
  "/auth/google",
  "/api/auth/callback/google",
  "/health",
  "/favicon.ico",
  "/robots.txt",
];

function isAtRouteOrChild(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** Promo settings are only rendered by the public marketing shell. */
export function shouldLoadPromoBarSettings(pathname: string) {
  return !ROUTES_WITHOUT_PROMO_SETTINGS.some((route) => isAtRouteOrChild(pathname, route));
}

/** Resource endpoints do not render the shared app shell and need no root settings query. */
export function shouldLoadRootSiteSettings(pathname: string) {
  return !ROUTES_WITHOUT_ROOT_SETTINGS.some((route) => isAtRouteOrChild(pathname, route));
}
