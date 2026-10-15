import { ADMIN_BASE_PATH, ADMIN_LOGIN_PATH } from "./admin-paths";

const redirectOrigin = "https://redirect.invalid";

/** Normalize before checking: browsers treat backslashes as URL separators. */
export function safeRedirectPath(value: unknown, fallback = "/dashboard") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const url = new URL(value, redirectOrigin);
    if (url.origin !== redirectOrigin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function safeAdminRedirect(value: unknown, fallback = ADMIN_BASE_PATH) {
  const destination = safeRedirectPath(value, fallback);
  const pathname = new URL(destination, redirectOrigin).pathname;
  if ((pathname !== ADMIN_BASE_PATH && !pathname.startsWith(`${ADMIN_BASE_PATH}/`))
      || pathname === ADMIN_LOGIN_PATH || pathname.startsWith(`${ADMIN_LOGIN_PATH}/`)) return fallback;
  return destination;
}
