import { isImmutableAssetPath } from "./static-assets";
import { normalizePathname } from "../app/lib/usage-protection.server";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://www.youtube.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https: https://*.cloudinary.com https://res.cloudinary.com",
  "connect-src 'self' wss://edicut.com https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com https://*.cloudinary.com https://www.google.com",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/",
].join("; ");

export function withStaticCacheHeaders(response: Response, pathname: string) {
  if (!response.ok) {
    return response;
  }

  const headers = new Headers(response.headers);

  if (isImmutableAssetPath(pathname)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else {
    headers.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  }

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function withSecurityHeaders(response: Response, request: Request, staticAsset = false) {
  const headers = new Headers(response.headers);
  const routePolicy = headers.get("Content-Security-Policy");
  // Enforce both policies so private downloads keep their stricter sandbox.
  headers.set("Content-Security-Policy", routePolicy && routePolicy !== CONTENT_SECURITY_POLICY
    ? `${CONTENT_SECURITY_POLICY}, ${routePolicy}` : CONTENT_SECURITY_POLICY);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  if (!["no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin"].includes(headers.get("Referrer-Policy") ?? "")) {
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");

  const url = new URL(request.url);
  if (url.protocol === "https:") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  const pathname = normalizePathname(url.pathname);
  const privatePath = ["/site/node-logmin", "/dashboard", "/checkout", "/signin", "/signout", "/forgot-password", "/update-password", "/auth", "/api"]
    .some(path => pathname === path || pathname.startsWith(`${path}/`));
  const authenticated = /(?:^|;\s*)(?:_session|_edicut_admin)=/.test(request.headers.get("Cookie") ?? "") || request.headers.has("Authorization");
  if (!staticAsset && (privatePath || authenticated || headers.has("Set-Cookie"))) {
    headers.set("Cache-Control", "no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

