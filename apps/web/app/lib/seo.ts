import type { MetaDescriptor } from "react-router";
import { DEFAULT_CONTACT_EMAIL } from "./contact-email";
import { PUBLIC_PAGE_PATHS } from "./public-pages";

export const DEFAULT_SEO_TITLE = "EdiCut | Video Editing for YouTube Creators";
export const DEFAULT_SEO_DESCRIPTION =
  "EdiCut edits YouTube videos, Shorts, podcasts, and thumbnails for creators, with a clear workflow for footage, reviews, and delivery.";
export const DEFAULT_PUBLIC_SITE_ORIGIN = "https://edicut.com";
export const SOCIAL_PREVIEW_IMAGE_PATH = "/images/edicut-homepage-share-2026.png";

export type SeoRouteArgs = {
  location: { pathname: string };
  matches: ReadonlyArray<{ id: string; loaderData?: unknown }>;
  error?: unknown;
};

type SeoPageContext = {
  appUrl?: string;
  pathname?: string;
  crawlingEnabled?: boolean;
  maintenanceModeEnabled?: boolean;
  titleTemplate?: string;
  defaultDescription?: string;
  pageOverride?: SeoMetaPageOverride | null;
};

export type SeoMetaPageOverride = {
  title?: string;
  description?: string;
  canonicalPath?: string;
  socialImageUrl?: string;
  socialTitle?: string;
  socialDescription?: string;
  indexable?: boolean;
};

const INDEXABLE_PUBLIC_PATHS = new Set(PUBLIC_PAGE_PATHS);

export function normalizePublicPath(pathname: string) {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export function getCanonicalSiteOrigin(_appUrl?: string) {
  return DEFAULT_PUBLIC_SITE_ORIGIN;
}

export function isProductionSiteUrl(appUrl?: string) {
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
  return INDEXABLE_PUBLIC_PATHS.has(normalized) || /^\/pricing\/[a-z0-9-]{1,100}$/.test(normalized);
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
  const pageOverride = context.pageOverride;
  const pageTitle = pageOverride?.title?.trim() || applySeoTitleTemplate(title, context.titleTemplate);
  const pageDescription = pageOverride?.description?.trim() || description || context.defaultDescription || DEFAULT_SEO_DESCRIPTION;
  const canonicalPath = pageOverride?.canonicalPath || context.pathname || "/";
  const canonicalUrl = getCanonicalUrl(appUrl, canonicalPath);
  const canIndexBySitePolicy = shouldIndexPage({
    pathname: context.pathname ?? "/",
    crawlingEnabled: context.crawlingEnabled ?? true,
    maintenanceModeEnabled: context.maintenanceModeEnabled ?? false,
    appUrl,
  })
    && pageOverride?.indexable !== false;
  const robots = canIndexBySitePolicy ? "index, follow" : "noindex, nofollow, noarchive";
  const socialTitle = pageOverride?.socialTitle?.trim() || pageTitle;
  const socialDescription = pageOverride?.socialDescription?.trim() || pageDescription;
  const socialImageUrl = getSafeSocialImageUrl(pageOverride?.socialImageUrl, appUrl);

  return [
    { title: pageTitle },
    { name: "description", content: pageDescription },
    { name: "robots", content: robots },
    { tagName: "link", rel: "canonical", href: canonicalUrl },
    { property: "og:site_name", content: "EdiCut" },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonicalUrl },
    { property: "og:title", content: socialTitle },
    { property: "og:description", content: socialDescription },
    { property: "og:image", content: socialImageUrl },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { property: "og:image:alt", content: pageOverride?.socialImageUrl ? "EdiCut social preview image." : "Screenshot of the current EdiCut homepage for YouTube video editing." },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:image", content: socialImageUrl },
    { name: "twitter:title", content: socialTitle },
    { name: "twitter:description", content: socialDescription },
  ];
}

export function applySeoTitleTemplate(title: string, template?: string) {
  const fallbackTemplate = "%s | EdiCut";
  const selectedTemplate = template?.trim() || fallbackTemplate;
  if (!selectedTemplate.includes("%s")) return title;

  // The default template must not duplicate the EdiCut brand already present in
  // most route titles. Custom templates replace an existing leading/trailing
  // brand marker before formatting so changing the template remains useful.
  if (selectedTemplate === fallbackTemplate && /\bedicut\b/i.test(title)) return title;
  const baseTitle = selectedTemplate === fallbackTemplate
    ? title
    : title
      .replace(/^\s*EdiCut\s*[|:]\s*/i, "")
      .replace(/\s*[|:]\s*EdiCut\s*$/i, "")
      .trim();
  return selectedTemplate.replace("%s", baseTitle || title).trim();
}

export function getSafeSocialImageUrl(value: string | undefined, appUrl?: string) {
  if (!value) return `${getCanonicalSiteOrigin(appUrl)}${SOCIAL_PREVIEW_IMAGE_PATH}`;
  try {
    const url = new URL(value, `${getCanonicalSiteOrigin(appUrl)}/`);
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      return `${getCanonicalSiteOrigin(appUrl)}${SOCIAL_PREVIEW_IMAGE_PATH}`;
    }
    return url.toString();
  } catch {
    return `${getCanonicalSiteOrigin(appUrl)}${SOCIAL_PREVIEW_IMAGE_PATH}`;
  }
}

export function createRouteMeta(args: SeoRouteArgs, title: string, description: string) {
  const rootData = args.matches.find((match) => match.id === "root")?.loaderData as {
    appUrl?: string;
    searchCrawlingEnabled?: boolean;
    maintenanceModeEnabled?: boolean;
    seoTitleTemplate?: string;
    seoDefaultDescription?: string;
    seoPageOverride?: SeoMetaPageOverride | null;
  } | undefined;

  return createPageMeta(title, description, {
    appUrl: rootData?.appUrl,
    pathname: args.location.pathname,
    crawlingEnabled: rootData?.searchCrawlingEnabled !== false && args.error == null,
    maintenanceModeEnabled: rootData?.maintenanceModeEnabled === true,
    titleTemplate: rootData?.seoTitleTemplate,
    defaultDescription: rootData?.seoDefaultDescription,
    pageOverride: rootData?.seoPageOverride,
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
        alternateName: "edicut.com",
        url: `${origin}/`,
        logo: `${origin}/favicon.png`,
        description: DEFAULT_SEO_DESCRIPTION,
        email: DEFAULT_CONTACT_EMAIL,
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: DEFAULT_CONTACT_EMAIL,
          url: `${origin}/contact`,
          availableLanguage: "English",
        },
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: "EdiCut",
        alternateName: "edicut.com",
        url: `${origin}/`,
        publisher: { "@id": `${origin}/#organization` },
        inLanguage: "en",
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
