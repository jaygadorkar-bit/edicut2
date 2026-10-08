const IMMUTABLE_ASSET_PATH = /^\/assets\/.+\.[a-z0-9]+$/i;
const PUBLIC_ASSET_PATH = /^\/(?:images\/.+|icons\/.+|audio\/.+|[^/]+\.(?:svg|png|jpg|jpeg|webp|avif))$/i;

export function isImmutableAssetPath(pathname: string) {
  return IMMUTABLE_ASSET_PATH.test(pathname);
}

export function shouldServeStaticAsset(method: string, pathname: string) {
  if (method !== "GET" && method !== "HEAD") return false;
  return isImmutableAssetPath(pathname) || PUBLIC_ASSET_PATH.test(pathname);
}
