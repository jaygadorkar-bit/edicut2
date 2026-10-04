import type { MetaDescriptor } from "react-router";

export const DEFAULT_SEO_TITLE = "EdiCut | YouTube Video Editing for Creators";
export const DEFAULT_SEO_DESCRIPTION =
  "EdiCut edits YouTube videos, Shorts, podcasts, and thumbnails for creators, with a clear workflow for footage, reviews, and delivery.";
export const DEFAULT_PUBLIC_SITE_ORIGIN = "https://edicut.com";
export const SOCIAL_PREVIEW_IMAGE_PATH = "/images/hero-suite.png";

export type SeoRouteArgs = {
  location: { pathname: string };
  matches: ReadonlyArray<{ id: string; data?: unknown }>;
};

type SeoPageContext = {
  appUrl?: string;
  pathname?: string;
  crawlingEnabled?: boolean;
  maintenanceModeEnabled?: boolean;
};

const INDEXABLE_PUBLIC_PATHS = new Set([
  "/",
  "/pricing",
  "/portfolio",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
]);

export function normalizePublicPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function getCanonicalSiteOrigin(_appUrl?: string) {
  return DEFAULT_PUBLIC_SITE_ORIGIN;
}

function isProductionSiteUrl(appUrl?: string) {
  if (!appUrl) return false;

  try {
    const url = new URL(appUrl);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (hostname === "edicut.com" || hostname === "www.edicut.com");
  } catch {
    return false;
  }
}

export function isLocalSiteUrl(appUrl?: string) {
  if (!appUrl) return false;

  try {
    return isLocalHostname(new URL(appUrl).hostname);
  } catch {
    return true;
  }
}

export function getCanonicalUrl(appUrl: string | undefined, pathname: string) {
  return new URL(normalizePublicPath(pathname), `${getCanonicalSiteOrigin(appUrl)}/`).toString();
}

export function isIndexablePublicPath(pathname: string) {
  const normalized = normalizePublicPath(pathname);
  return INDEXABLE_PUBLIC_PATHS.has(normalized) || /^\/pricing\/[^/]+$/.test(normalized);
}

export function shouldIndexPage({
  pathname,
  crawlingEnabled,
  maintenanceModeEnabled,
  appUrl,
}: {
  pathname: string;
  crawlingEnabled: boolean;
  maintenanceModeEnabled: boolean;
  appUrl?: string;
}) {
  return crawlingEnabled && !maintenanceModeEnabled && isProductionSiteUrl(appUrl) && isIndexablePublicPath(pathname);
}

export function createPageMeta(title: string, description: string, context: SeoPageContext = {}): MetaDescriptor[] {
  const appUrl = context.appUrl;
  const canonicalUrl = getCanonicalUrl(appUrl, context.pathname ?? "/");
  const robots = shouldIndexPage({
    pathname: context.pathname ?? "/",
    crawlingEnabled: context.crawlingEnabled ?? true,
    maintenanceModeEnabled: context.maintenanceModeEnabled ?? false,
    appUrl,
  })
    ? "index, follow"
    : "noindex, nofollow, noarchive";
  const socialImageUrl = `${getCanonicalSiteOrigin(appUrl)}${SOCIAL_PREVIEW_IMAGE_PATH}`;

  return [
    { title },
    { name: "description", content: description },
    { name: "robots", content: robots },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { property: "og:site_name", content: "EdiCut" },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonicalUrl },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: socialImageUrl },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1024" },
    { property: "og:image:height", content: "1024" },
    { property: "og:image:alt", content: "Video editors working in a creator post-production studio" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: socialImageUrl },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

export function createRouteMeta(args: SeoRouteArgs, title: string, description: string) {
  const rootData = args.matches.find((match) => match.id === "root")?.data as {
    appUrl?: string;
    searchCrawlingEnabled?: boolean;
    maintenanceModeEnabled?: boolean;
  } | undefined;

  return createPageMeta(title, description, {
    appUrl: rootData?.appUrl,
    pathname: args.location.pathname,
    crawlingEnabled: rootData?.searchCrawlingEnabled !== false,
    maintenanceModeEnabled: rootData?.maintenanceModeEnabled === true,
  });
}

export function createSiteStructuredData(appUrl?: string) {
  const origin = getCanonicalSiteOrigin(appUrl);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "EdiCut",
        url: `${origin}/`,
        logo: `${origin}/icons/edicut-logo.svg`,
        description: DEFAULT_SEO_DESCRIPTION,
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: "EdiCut",
        url: `${origin}/`,
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function isLocalHostname(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host === "[::1]" || host.endsWith(".localhost");
}
