export const ADMIN_BASE_PATH = "/site/node-logmin";
export const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/login`;

export function adminPath(path: string = "") {
  return `${ADMIN_BASE_PATH}${path}`;
}

