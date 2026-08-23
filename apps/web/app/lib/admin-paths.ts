export const ADMIN_BASE_PATH = "/site/node-logmin";
export const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/login`;
export const ADMIN_ACCESS_PATH = `${ADMIN_BASE_PATH}/access`;

export function adminPath(path: string = "") {
  return `${ADMIN_BASE_PATH}${path}`;
}

export function adminAccessPath(returnTo: string = ADMIN_BASE_PATH) {
  return `${ADMIN_ACCESS_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}

