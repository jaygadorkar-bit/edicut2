import { ADMIN_ACCESS_PATH, ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./admin-paths";

const ROUTES_WITHOUT_SITE_MOTION = [
  ADMIN_BASE_PATH,
  "/dashboard",
  "/signin",
  "/forgot-password",
  "/update-password",
  "/auth",
  "/api",
  "/checkout",
];

function isAtRouteOrChild(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/** Site-wide scrolling and page transitions are unnecessary in account flows and workspace tools. */
export function shouldEnableSiteMotion(pathname: string) {
  return !ROUTES_WITHOUT_SITE_MOTION.some((route) => isAtRouteOrChild(pathname, route));
}

export function shouldUseWorkspaceLoader(pathname: string) {
  return isAtRouteOrChild(pathname, "/dashboard") || (
    isAtRouteOrChild(pathname, ADMIN_BASE_PATH) &&
    pathname !== ADMIN_LOGIN_PATH && pathname !== ADMIN_ACCESS_PATH
  );
}
