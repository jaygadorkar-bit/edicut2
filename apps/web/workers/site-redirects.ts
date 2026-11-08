const CANONICAL_HOST = "edicut.com";

/** Redirect legacy public URLs before Cloudflare serves a prerendered asset. */
export function getCanonicalSiteRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const isLegacyAboutPage = (request.method === "GET" || request.method === "HEAD") && pathname === "/about";
  const isAlternateHost = url.hostname.toLowerCase() === `www.${CANONICAL_HOST}`;

  if (!isLegacyAboutPage && !isAlternateHost) return null;

  if (isLegacyAboutPage) url.pathname = "/why-hire-us";
  if (isAlternateHost) url.hostname = CANONICAL_HOST;

  return Response.redirect(url.toString(), 308);
}
