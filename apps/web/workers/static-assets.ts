import { ALL_EDITING_PACKAGES } from "../app/lib/subscriptions";
import { PUBLIC_PAGE_PATHS } from "../app/lib/public-pages";

const IMMUTABLE_ASSET_PATH = /^\/assets\/.+\.[a-z0-9]+$/i;
const PUBLIC_ASSET_PATH = /^\/(?:images\/.+|icons\/.+|audio\/.+|artwork\/.+|fonts\/.+|media\/blog\/[^/]+\.(?:mp4|m4a|vtt|webp)|[^/]+\.(?:ico|svg|png|jpg|jpeg|webp|avif))$/i;
const STATIC_PUBLIC_PAGE_PATHS = new Set([
  ...PUBLIC_PAGE_PATHS,
  ...ALL_EDITING_PACKAGES.map((item) => `/pricing/${item.slug}`),
]);

export function isImmutableAssetPath(pathname: string) {
  return IMMUTABLE_ASSET_PATH.test(pathname);
}

export function shouldServeStaticAsset(method: string, pathname: string) {
  if (method !== "GET" && method !== "HEAD") return false;
  return isImmutableAssetPath(pathname) || PUBLIC_ASSET_PATH.test(pathname);
}

/** Public HTML must pass through the Worker so host redirects run before assets. */
export function shouldServeStaticPublicPage(method: string, pathname: string) {
  if (method !== "GET" && method !== "HEAD") return false;
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  return STATIC_PUBLIC_PAGE_PATHS.has(normalizedPath);
}
