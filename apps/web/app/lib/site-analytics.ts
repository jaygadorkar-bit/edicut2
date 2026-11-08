export const SITE_ANALYTICS_CONSENT_KEY = "edicut-cookie-consent-v1";

export const SITE_ANALYTICS_REGIONS = [
  { id: "navigation", label: "Navigation" },
  { id: "hero", label: "Homepage hero" },
  { id: "audience", label: "Audience section" },
  { id: "workflow", label: "How it works" },
  { id: "portfolio", label: "Portfolio" },
  { id: "pricing", label: "Pricing" },
  { id: "faq", label: "FAQ" },
  { id: "contact", label: "Contact" },
  { id: "support", label: "Support widget" },
  { id: "footer", label: "Footer" },
  { id: "page-content", label: "Other page content" },
] as const;

export type SiteAnalyticsRegion = (typeof SITE_ANALYTICS_REGIONS)[number]["id"];

export const SITE_ANALYTICS_SOURCES = [
  { id: "organic_search", label: "Organic search" },
  { id: "paid_search", label: "Paid search" },
  { id: "social", label: "Social" },
  { id: "email", label: "Email" },
  { id: "referral", label: "Other referrals" },
  { id: "direct", label: "Direct / unknown" },
  { id: "other_campaign", label: "Other campaigns" },
] as const;

export const SITE_ANALYTICS_EVENTS = [
  { id: "page_view", label: "Page views" },
  { id: "contact_inquiry", label: "Inquiries sent" },
  { id: "quote_request", label: "Quote requests sent" },
  { id: "checkout_start", label: "Checkout selections" },
] as const;

export type SiteAnalyticsSource = (typeof SITE_ANALYTICS_SOURCES)[number]["id"];
export type SiteAnalyticsEvent = (typeof SITE_ANALYTICS_EVENTS)[number]["id"];
export type SiteAcquisitionDelta = {
  pagePath: string;
  landingPath: string;
  source: SiteAnalyticsSource;
  event: SiteAnalyticsEvent;
  count: number;
};

const publicAnalyticsPaths = new Set([
  "/",
  "/why-hire-us",
  "/pricing",
  "/portfolio",
  "/services",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/maintenance",
]);

export function isPublicAnalyticsPath(path: string) {
  return publicAnalyticsPaths.has(path) || /^\/(pricing|services)\/[a-z0-9-]{1,100}$/.test(path);
}

/** Conversion pages may carry attribution, but must never be counted as page views. */
export function isConversionOnlyAnalyticsPath(path: string) {
  return path === "/custom-quote";
}

export function isSafeSiteAnalyticsLandingPath(path: string) {
  return isPublicAnalyticsPath(path) || isConversionOnlyAnalyticsPath(path);
}

/** Classifies locally. Neither referrer URLs nor campaign values leave the browser. */
export function classifySiteAnalyticsSource(referrer: string, currentOrigin: string, search = ""): SiteAnalyticsSource {
  const medium = new URLSearchParams(search).get("utm_medium")?.toLowerCase();
  if (medium && ["cpc", "ppc", "paidsearch", "paid_search"].includes(medium)) return "paid_search";
  if (medium && ["social", "social-network", "social_media", "paid_social"].includes(medium)) return "social";
  if (medium === "email") return "email";
  if (medium === "organic") return "organic_search";
  if (medium) return "other_campaign";
  if (!referrer) return "direct";
  try {
    const url = new URL(referrer);
    if (url.origin === currentOrigin) return "direct";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (/^(?:[a-z0-9-]+\.)*(?:google\.(?:com|[a-z]{2}|(?:co|com)\.[a-z]{2})|bing\.com|duckduckgo\.com|search\.yahoo\.com|search\.brave\.com|ecosia\.org|baidu\.com|yandex\.(?:com|ru))$/.test(host)) return "organic_search";
    if (/(^|\.)(facebook\.com|instagram\.com|tiktok\.com|linkedin\.com|youtube\.com|pinterest\.com|reddit\.com|twitter\.com|x\.com|t\.co)$/.test(host)) return "social";
    return "referral";
  } catch {
    return "direct";
  }
}

export type SiteAnalyticsDelta = {
  region: SiteAnalyticsRegion;
  hoverCount: number;
  clickCount: number;
  dwellMs: number;
};

let runtimeConsent: boolean | null = null;

export function setSiteAnalyticsConsent(accepted: boolean) {
  runtimeConsent = accepted;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  const maxAge = accepted ? "; Max-Age=31536000" : "; Max-Age=0";
  document.cookie = `edicut_analytics_consent=${accepted ? "yes" : ""}; Path=/api/site-analytics; SameSite=Strict${maxAge}${secure}`;
}

export function hasSiteAnalyticsConsent() {
  try {
    const saved = window.localStorage.getItem(SITE_ANALYTICS_CONSENT_KEY);
    return saved ? (JSON.parse(saved) as { analytics?: unknown }).analytics === true : runtimeConsent === true;
  } catch {
    return runtimeConsent === true;
  }
}
