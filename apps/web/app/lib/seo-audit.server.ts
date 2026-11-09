import { PUBLIC_PAGE_PATHS } from "./public-pages";
import { DEFAULT_PUBLIC_SITE_ORIGIN } from "./seo";

const SITE_ORIGIN = new URL(DEFAULT_PUBLIC_SITE_ORIGIN);
const OWNED_HOSTNAMES = new Set(["edicut.com", "www.edicut.com"]);
const MAX_AUDIT_PAGES = 60;
const MAX_HTML_BYTES = 512_000;
const MAX_ROBOTS_BYTES = 32_000;
const MAX_SITEMAP_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export type SeoAuditSeverity = "error" | "warning" | "info";

export type SeoAuditIssue = {
  id: string;
  code: string;
  path: string;
  severity: SeoAuditSeverity;
  message: string;
  recommendation: string;
};

export type SeoAuditedPage = {
  path: string;
  url: string;
  status: number | null;
  finalUrl: string | null;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  titleTagCount: number;
  descriptionTagCount: number;
  canonicalTagCount: number;
  h1Count: number;
  imageCount: number;
  imagesMissingAlt: number;
  internalLinks: string[];
  issues: SeoAuditIssue[];
};

export type SeoInternalLinkSuggestion = {
  sourcePath: string;
  targetPath: string;
  anchorText: string;
  relatedTerms: string[];
  reason: string;
  score: number;
};

export type SeoTechnicalAudit = {
  origin: string;
  auditedAt: string;
  pages: SeoAuditedPage[];
  issues: SeoAuditIssue[];
  suggestions: SeoInternalLinkSuggestion[];
  sitemap: {
    status: number | null;
    urlCount: number;
    missingPublicPaths: string[];
  };
  robots: {
    status: number | null;
    hasSitemapReference: boolean;
    disallowsAll: boolean;
  };
  limits: {
    requestedPageCount: number;
    auditedPageCount: number;
    truncatedHtmlPages: number;
  };
};

export type SeoAuditFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type RunSeoTechnicalAuditOptions = {
  /** Override fetch for the runtime or tests. All requested URLs remain on the EdiCut host. */
  fetchImpl?: SeoAuditFetch;
  /** Maximum number of public pages to inspect (1–60). */
  maxPages?: number;
  /** Maximum number of page requests running at once (1–8). */
  concurrency?: number;
  /** Per-request timeout in milliseconds (500–10000). */
  timeoutMs?: number;
};

type FetchTextResult = {
  status: number | null;
  finalUrl: string | null;
  text: string;
  truncated: boolean;
  failure?: "timeout" | "network" | "redirect" | "too-large";
};

type ParsedPage = Omit<SeoAuditedPage, "issues"> & { issues: SeoAuditIssue[]; titleTokens: Set<string> };

const STOP_WORDS = new Set([
  "about", "and", "are", "for", "from", "into", "our", "the", "this", "with", "your",
  "video", "videos", "editing", "edicut", "service", "services", "page", "guide", "how",
]);

/**
 * Crawl a bounded set of known public EdiCut pages and check their HTTP/meta output plus
 * sitemap/robots coverage. This intentionally does not query Search Console or claim rankings.
 */
export async function runSeoTechnicalAudit(
  options: RunSeoTechnicalAuditOptions = {},
): Promise<SeoTechnicalAudit> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxPages = clampInteger(options.maxPages, PUBLIC_PAGE_PATHS.length + 20, 1, MAX_AUDIT_PAGES);
  const concurrency = clampInteger(options.concurrency, 4, 1, 8);
  const timeoutMs = clampInteger(options.timeoutMs, 5_000, 500, 10_000);
  const auditedAt = new Date().toISOString();

  const [robotsResult, sitemapResult] = await Promise.all([
    fetchBoundedText(new URL("/robots.txt", SITE_ORIGIN), fetchImpl, timeoutMs, MAX_ROBOTS_BYTES),
    fetchBoundedText(new URL("/sitemap.xml", SITE_ORIGIN), fetchImpl, timeoutMs, MAX_SITEMAP_BYTES),
  ]);

  const sitemapLocations = sitemapResult.status === 200 ? extractSitemapUrls(sitemapResult.text) : [];
  const sitemapPaths = sitemapLocations
    .map((location) => toAllowedPublicPath(location))
    .filter((path): path is string => path !== null);
  const availablePaths = uniquePaths([...PUBLIC_PAGE_PATHS, ...sitemapPaths]);
  const auditPaths = availablePaths.slice(0, maxPages);
  const parsedPages = await mapWithConcurrency(auditPaths, concurrency, async (path) =>
    auditPage(path, fetchImpl, timeoutMs),
  );

  const pageIssues = parsedPages.flatMap(({ issues }) => issues);
  const sitemapPathsSet = new Set(sitemapPaths);
  const missingPublicPaths = PUBLIC_PAGE_PATHS.filter((path) => !sitemapPathsSet.has(path));
  const issues: SeoAuditIssue[] = [
    ...pageIssues,
    ...getCrawlerIssues(robotsResult, sitemapResult, sitemapLocations, missingPublicPaths),
  ];
  const pages = parsedPages.map(({ titleTokens: _titleTokens, ...page }) => page);
  const suggestions = findInternalLinkSuggestions(parsedPages);

  return {
    origin: SITE_ORIGIN.origin,
    auditedAt,
    pages,
    issues: dedupeIssues(issues),
    suggestions,
    sitemap: {
      status: sitemapResult.status,
      urlCount: sitemapLocations.length,
      missingPublicPaths,
    },
    robots: {
      status: robotsResult.status,
      hasSitemapReference: /(?:^|\n)\s*sitemap:\s*https?:\/\/edicut\.com\/sitemap\.xml\s*(?:\n|$)/i.test(robotsResult.text),
      disallowsAll: /user-agent:\s*\*[^]*?disallow:\s*\/\s*(?:\n|$)/i.test(robotsResult.text),
    },
    limits: {
      requestedPageCount: availablePaths.length,
      auditedPageCount: pages.length,
      truncatedHtmlPages: parsedPages.filter((page) => page.htmlTruncated).length,
    },
  };
}

/** Create deterministic, content-derived internal-link opportunities from audited pages. */
export function findInternalLinkSuggestions(
  pages: ReadonlyArray<Pick<SeoAuditedPage, "path" | "title" | "internalLinks" | "status">>,
  maxPerPage = 3,
): SeoInternalLinkSuggestion[] {
  const limit = clampInteger(maxPerPage, 3, 1, 10);
  const validPages = pages.filter((page) => page.status !== null && page.status >= 200 && page.status < 300);
  const inbound = new Map<string, number>();
  const pageTokens = new Map<string, Set<string>>();

  for (const page of validPages) {
    pageTokens.set(page.path, getPageTokens(page.path, page.title ?? ""));
    for (const target of page.internalLinks) inbound.set(target, (inbound.get(target) ?? 0) + 1);
  }

  const suggestions: SeoInternalLinkSuggestion[] = [];
  for (const source of validPages) {
    const sourceTokens = pageTokens.get(source.path) ?? new Set<string>();
    const currentLinks = new Set(source.internalLinks);
    const candidates = validPages
      .filter((target) => target.path !== source.path && !currentLinks.has(target.path))
      .map((target) => {
        const targetTokens = pageTokens.get(target.path) ?? new Set<string>();
        const sharedTerms = [...targetTokens].filter((term) => sourceTokens.has(term)).sort();
        const orphanBonus = (inbound.get(target.path) ?? 0) === 0 ? 1 : 0;
        const sectionBonus = getSection(source.path) === getSection(target.path) ? 0.25 : 0;
        const score = sharedTerms.length * 2 + orphanBonus + sectionBonus;
        return { target, sharedTerms, score, orphanBonus };
      })
      .filter((candidate) => candidate.sharedTerms.length > 0)
      .sort((left, right) => right.score - left.score || left.target.path.localeCompare(right.target.path))
      .slice(0, limit);

    for (const { target, sharedTerms, score, orphanBonus } of candidates) {
      const anchorText = target.title?.trim() || pathToLabel(target.path);
      suggestions.push({
        sourcePath: source.path,
        targetPath: target.path,
        anchorText: anchorText.slice(0, 120),
        relatedTerms: sharedTerms,
        score,
        reason: orphanBonus > 0
          ? `Related page with no incoming links; link to it from “${source.title || pathToLabel(source.path)}”.`
          : `Related topics share ${sharedTerms.join(", ")}; add a contextual link if it fits the page copy.`,
      });
    }
  }

  return suggestions.sort((left, right) => right.score - left.score
    || left.sourcePath.localeCompare(right.sourcePath)
    || left.targetPath.localeCompare(right.targetPath));
}

type ParsedAuditPage = ParsedPage & { htmlTruncated: boolean };

async function auditPage(path: string, fetchImpl: SeoAuditFetch, timeoutMs: number): Promise<ParsedAuditPage> {
  const url = new URL(path, SITE_ORIGIN);
  const result = await fetchBoundedText(url, fetchImpl, timeoutMs, MAX_HTML_BYTES);
  const pageIssues: SeoAuditIssue[] = [];
  const parsed = result.status === 200 ? parsePageHtml(result.text, path) : emptyParsedPage(path);

  if (result.status === null) {
    pageIssues.push(makeIssue(path, "page_unreachable", "error", "Page could not be fetched.", "Check the site's availability and try the audit again."));
  } else if (result.status < 200 || result.status >= 300) {
    pageIssues.push(makeIssue(path, "http_status", "error", `Page returned HTTP ${result.status}.`, "Restore the page or redirect it to a relevant live page."));
  } else if (result.status !== 200) {
    pageIssues.push(makeIssue(path, "http_non_200", "warning", `Page returned HTTP ${result.status}.`, "Use HTTP 200 for a live canonical page."));
  }

  if (result.failure === "redirect") {
    pageIssues.push(makeIssue(path, "unsafe_redirect", "error", "Page redirected outside the approved EdiCut public URL set.", "Keep redirects on the canonical EdiCut domain and send them to a known public page."));
  }
  if (result.failure === "timeout") {
    pageIssues.push(makeIssue(path, "request_timeout", "warning", "Page request timed out.", "Check server response time and repeat the audit."));
  }
  if (result.failure === "too-large") {
    pageIssues.push(makeIssue(path, "html_truncated", "info", "Page HTML exceeded the audit read limit.", "The audit checks only the first 512 KB of HTML; verify remaining markup separately."));
  }
  if (result.finalUrl && (new URL(result.finalUrl).origin !== SITE_ORIGIN.origin || normalizePath(new URL(result.finalUrl).pathname) !== path)) {
    pageIssues.push(makeIssue(path, "page_redirected", "warning", "Page redirects to a different URL.", "Update sitemap and internal links to point directly to the preferred canonical URL."));
  }

  if (result.status === 200 && (!result.truncated || result.text.length > 0)) {
    pageIssues.push(...checkPageMeta(path, parsed));
  }

  return {
    ...parsed,
    status: result.status,
    finalUrl: result.finalUrl,
    issues: pageIssues,
    htmlTruncated: result.truncated,
  };
}

function parsePageHtml(html: string, path: string): Omit<ParsedAuditPage, "status" | "finalUrl" | "issues" | "htmlTruncated"> {
  const titleTags = [...html.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)];
  const descriptionValues = getMetaValues(html, "name", "description");
  const canonicalValues = getLinkValues(html, "canonical");
  const robotsValues = getMetaValues(html, "name", "robots");
  const h1Count = [...html.matchAll(/<h1\b[^>]*>/gi)].length;
  const images = [...html.matchAll(/<img\b[^>]*>/gi)];
  const imagesMissingAlt = images.filter((match) => {
    const attrs = parseAttributes(match[0]);
    return !Object.hasOwn(attrs, "alt") || !attrs.alt.trim();
  }).length;
  const internalLinks = extractInternalLinks(html);
  const title = titleTags.length > 0 ? cleanText(titleTags[0][1]) : null;
  const description = descriptionValues.length > 0 ? descriptionValues[0] : null;
  const tokens = getPageTokens(path, `${title ?? ""} ${description ?? ""} ${collectHeadingText(html)}`);

  return {
    path,
    url: new URL(path, SITE_ORIGIN).toString(),
    title,
    description,
    canonical: canonicalValues[0] ?? null,
    robots: robotsValues[0] ?? null,
    titleTagCount: titleTags.length,
    descriptionTagCount: descriptionValues.length,
    canonicalTagCount: canonicalValues.length,
    h1Count,
    imageCount: images.length,
    imagesMissingAlt,
    internalLinks,
    titleTokens: tokens,
  };
}

function emptyParsedPage(path: string): Omit<ParsedAuditPage, "status" | "finalUrl" | "issues" | "htmlTruncated"> {
  return {
    path,
    url: new URL(path, SITE_ORIGIN).toString(),
    title: null,
    description: null,
    canonical: null,
    robots: null,
    titleTagCount: 0,
    descriptionTagCount: 0,
    canonicalTagCount: 0,
    h1Count: 0,
    imageCount: 0,
    imagesMissingAlt: 0,
    internalLinks: [],
    titleTokens: getPageTokens(path, ""),
  };
}

function checkPageMeta(path: string, page: Pick<ParsedPage, "title" | "description" | "canonical" | "robots" | "titleTagCount" | "descriptionTagCount" | "canonicalTagCount" | "h1Count" | "imageCount" | "imagesMissingAlt">) {
  const issues: SeoAuditIssue[] = [];
  if (!page.title) issues.push(makeIssue(path, "title_missing", "error", "Page title is missing.", "Add a unique, descriptive title for this page."));
  else if (page.title.length > 60) issues.push(makeIssue(path, "title_long", "warning", `Page title is ${page.title.length} characters.`, "Consider shortening the title while keeping its main topic clear."));
  else if (page.title.length < 15) issues.push(makeIssue(path, "title_short", "info", `Page title is ${page.title.length} characters.`, "Consider adding enough context to distinguish the page in search results."));
  if (page.titleTagCount > 1) issues.push(makeIssue(path, "title_multiple", "warning", `Page has ${page.titleTagCount} title tags.`, "Keep one unique title tag in the document head."));

  if (!page.description) issues.push(makeIssue(path, "description_missing", "error", "Meta description is missing.", "Add a clear summary that is specific to this page."));
  else if (page.description.length > 160) issues.push(makeIssue(path, "description_long", "warning", `Meta description is ${page.description.length} characters.`, "Shorten it to a concise summary; search engines may truncate long descriptions."));
  else if (page.description.length < 70) issues.push(makeIssue(path, "description_short", "info", `Meta description is ${page.description.length} characters.`, "Consider adding a little more useful detail about the page."));
  if (page.descriptionTagCount > 1) issues.push(makeIssue(path, "description_multiple", "warning", `Page has ${page.descriptionTagCount} meta description tags.`, "Keep one unique meta description in the document head."));

  if (!page.canonical) {
    issues.push(makeIssue(path, "canonical_missing", "error", "Canonical URL is missing.", "Add a canonical URL pointing to this page's preferred EdiCut URL."));
  } else {
    try {
      const canonical = new URL(page.canonical, SITE_ORIGIN);
      const expected = new URL(path, SITE_ORIGIN);
      if (canonical.origin !== SITE_ORIGIN.origin || normalizePath(canonical.pathname) !== normalizePath(expected.pathname) || canonical.search || canonical.hash) {
        issues.push(makeIssue(path, "canonical_mismatch", "warning", "Canonical URL points to a different URL.", "Use this page's preferred HTTPS EdiCut URL as its canonical."));
      }
    } catch {
      issues.push(makeIssue(path, "canonical_invalid", "error", "Canonical URL is invalid.", "Replace it with an absolute or root-relative EdiCut URL."));
    }
  }
  if (page.canonicalTagCount > 1) issues.push(makeIssue(path, "canonical_multiple", "warning", `Page has ${page.canonicalTagCount} canonical links.`, "Keep one canonical URL in the document head."));

  if (page.robots && /(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/i.test(page.robots)) {
    issues.push(makeIssue(path, "page_noindex", "warning", "Public page includes a noindex directive.", "Remove noindex if this page should appear in search results."));
  }
  if (page.h1Count === 0) issues.push(makeIssue(path, "h1_missing", "warning", "Page has no H1 heading.", "Add one clear main heading that describes the page."));
  if (page.h1Count > 1) issues.push(makeIssue(path, "h1_multiple", "info", `Page has ${page.h1Count} H1 headings.`, "Review headings so the page has one clear primary heading."));
  if (page.imagesMissingAlt > 0) issues.push(makeIssue(path, "image_alt_missing", "warning", `${page.imagesMissingAlt} of ${page.imageCount} checked images have missing or empty alt text.`, "Add concise alt text to informative images; use empty alt only for decorative images."));

  return issues;
}

function getCrawlerIssues(
  robots: FetchTextResult,
  sitemap: FetchTextResult,
  sitemapLocations: string[],
  missingPublicPaths: string[],
) {
  const issues: SeoAuditIssue[] = [];
  if (robots.status !== 200) issues.push(makeIssue("/robots.txt", "robots_unavailable", "error", `robots.txt returned ${robots.status === null ? "no response" : `HTTP ${robots.status}`}.`, "Restore the robots.txt endpoint and allow crawlers to read it."));
  if (robots.status === 200 && !/(?:^|\n)\s*sitemap:\s*https?:\/\/edicut\.com\/sitemap\.xml\s*(?:\n|$)/i.test(robots.text)) {
    issues.push(makeIssue("/robots.txt", "robots_sitemap_missing", "warning", "robots.txt does not reference the canonical sitemap.", "Add Sitemap: https://edicut.com/sitemap.xml to robots.txt."));
  }
  if (robots.status === 200 && /user-agent:\s*\*[^]*?disallow:\s*\/\s*(?:\n|$)/i.test(robots.text)) {
    issues.push(makeIssue("/robots.txt", "robots_blocks_all", "error", "robots.txt disallows crawling for all user agents.", "Remove the sitewide disallow rule when the public site is ready to be crawled."));
  }

  if (sitemap.status !== 200) issues.push(makeIssue("/sitemap.xml", "sitemap_unavailable", "error", `Sitemap returned ${sitemap.status === null ? "no response" : `HTTP ${sitemap.status}`}.`, "Restore the XML sitemap endpoint."));
  else if (sitemapLocations.length === 0) issues.push(makeIssue("/sitemap.xml", "sitemap_empty", "error", "Sitemap contains no readable URL entries.", "Return a valid sitemap XML document with canonical public URLs."));
  for (const path of missingPublicPaths) {
    issues.push(makeIssue(path, "sitemap_page_missing", "warning", "Public page is missing from the sitemap.", "Include the canonical public URL in the sitemap if it should be indexed."));
  }
  if (sitemapLocations.some((location) => toAllowedPublicPath(location) === null && isAbsoluteExternalUrl(location))) {
    issues.push(makeIssue("/sitemap.xml", "sitemap_external_url", "warning", "Sitemap contains a URL outside the EdiCut public URL set.", "Keep sitemap entries on the canonical EdiCut domain and include only public pages."));
  }

  return issues;
}

function extractInternalLinks(html: string) {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = parseAttributes(match[0]).href;
    if (!href) continue;
    try {
      const url = new URL(decodeHtmlEntities(href), SITE_ORIGIN);
      if (!isOwnedUrl(url)) continue;
      const path = normalizePath(url.pathname);
      if (isKnownPublicPath(path)) links.add(path);
    } catch {
      // Ignore malformed or non-URL href values.
    }
  }
  return [...links].sort();
}

function extractSitemapUrls(xml: string) {
  return [...xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)]
    .map((match) => decodeXmlEntities(match[1].trim()))
    .filter((location) => location.length <= 2_048);
}

function toAllowedPublicPath(value: string): string | null {
  try {
    const url = new URL(value, SITE_ORIGIN);
    if (!isOwnedUrl(url) || url.search || url.hash) return null;
    const path = normalizePath(url.pathname);
    return isKnownPublicPath(path) ? path : null;
  } catch {
    return null;
  }
}

function isOwnedUrl(url: URL) {
  return url.protocol === "https:" && OWNED_HOSTNAMES.has(url.hostname.toLowerCase()) && !url.port;
}

function isAbsoluteExternalUrl(value: string) {
  try {
    return !isOwnedUrl(new URL(value));
  } catch {
    return false;
  }
}

function isKnownPublicPath(path: string) {
  return PUBLIC_PAGE_PATHS.includes(path)
    || /^\/pricing\/[a-z0-9-]{1,100}$/.test(path);
}

async function fetchBoundedText(url: URL, fetchImpl: SeoAuditFetch, timeoutMs: number, maxBytes: number): Promise<FetchTextResult> {
  let currentUrl = new URL(url);
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    if (!isOwnedUrl(currentUrl) || !isKnownAuditEndpoint(currentUrl.pathname)) {
      return { status: null, finalUrl: null, text: "", truncated: false, failure: "redirect" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { Accept: currentUrl.pathname === "/sitemap.xml" ? "application/xml,text/xml" : "text/html,text/plain" },
      });
    } catch {
      clearTimeout(timeout);
      return { status: null, finalUrl: null, text: "", truncated: false, failure: controller.signal.aborted ? "timeout" : "network" };
    }
    if (response.url) {
      try {
        const responseUrl = new URL(response.url);
        if (!isOwnedUrl(responseUrl) || !isKnownAuditEndpoint(responseUrl.pathname)) {
          clearTimeout(timeout);
          await cancelBody(response);
          return { status: response.status, finalUrl: null, text: "", truncated: false, failure: "redirect" };
        }
      } catch {
        clearTimeout(timeout);
        await cancelBody(response);
        return { status: response.status, finalUrl: null, text: "", truncated: false, failure: "redirect" };
      }
    }

    if (isRedirectStatus(response.status)) {
      const location = response.headers.get("location");
      clearTimeout(timeout);
      await cancelBody(response);
      if (!location || redirectCount === MAX_REDIRECTS) {
        return { status: response.status, finalUrl: null, text: "", truncated: false, failure: "redirect" };
      }
      try {
        const nextUrl = new URL(location, currentUrl);
        if (!isOwnedUrl(nextUrl) || !isKnownAuditEndpoint(nextUrl.pathname) || nextUrl.search || nextUrl.hash) {
          return { status: response.status, finalUrl: null, text: "", truncated: false, failure: "redirect" };
        }
        currentUrl = nextUrl;
        redirectCount += 1;
        continue;
      } catch {
        return { status: response.status, finalUrl: null, text: "", truncated: false, failure: "redirect" };
      }
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      clearTimeout(timeout);
      await cancelBody(response);
      return { status: response.status, finalUrl: currentUrl.toString(), text: "", truncated: true, failure: "too-large" };
    }
    const read = await readResponseText(response, maxBytes);
    clearTimeout(timeout);
    return {
      status: response.status,
      finalUrl: currentUrl.toString(),
      text: read.text,
      truncated: read.truncated,
      failure: controller.signal.aborted ? "timeout" : read.truncated ? "too-large" : undefined,
    };
  }

  return { status: null, finalUrl: null, text: "", truncated: false, failure: "redirect" };
}

async function readResponseText(response: Response, maxBytes: number) {
  if (!response.body) return { text: "", truncated: false };
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;
  let truncated = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - bytesRead;
      if (value.byteLength > remaining) {
        text += decoder.decode(value.subarray(0, Math.max(0, remaining)), { stream: true });
        bytesRead += Math.max(0, remaining);
        truncated = true;
        await reader.cancel();
        break;
      }
      bytesRead += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (bytesRead >= maxBytes) {
        const next = await reader.read();
        if (!next.done) {
          truncated = true;
          await reader.cancel();
        }
        break;
      }
    }
    text += decoder.decode();
  } catch {
    await reader.cancel().catch(() => undefined);
  }
  return { text, truncated };
}

async function cancelBody(response: Response) {
  await response.body?.cancel().catch(() => undefined);
}

function isKnownAuditEndpoint(path: string) {
  const normalized = normalizePath(path);
  return normalized === "/robots.txt" || normalized === "/sitemap.xml" || isKnownPublicPath(normalized);
}

function isRedirectStatus(status: number) {
  return status >= 300 && status < 400;
}

function getMetaValues(html: string, attribute: string, value: string) {
  const results: string[] = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs[attribute] ?? "").toLowerCase() === value.toLowerCase() && attrs.content !== undefined) {
      results.push(cleanText(attrs.content));
    }
  }
  return results;
}

function getLinkValues(html: string, rel: string) {
  const results: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseAttributes(match[0]);
    if ((attrs.rel ?? "").toLowerCase().split(/\s+/).includes(rel.toLowerCase()) && attrs.href) {
      results.push(cleanText(attrs.href));
    }
  }
  return results;
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const attributePattern = /([^\s<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const content = tag.slice(tag.indexOf(" ") + 1).replace(/\s*\/?\s*>\s*$/, " ");
  for (const match of content.matchAll(attributePattern)) {
    const name = match[1].toLowerCase();
    if (name === "<meta" || name === "<link" || name === "<a" || name === "<img") continue;
    attributes[name] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function cleanText(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ")).trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_match, entity: string) => {
      const normalized = entity.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "quot") return '"';
      if (normalized === "apos") return "'";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized === "nbsp") return " ";
      const codepoint = normalized.startsWith("#x")
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseInt(normalized.slice(1), 10);
      try {
        return Number.isFinite(codepoint) && codepoint >= 0 && codepoint <= 0x10ffff
          ? String.fromCodePoint(codepoint)
          : "";
      } catch {
        return "";
      }
    });
}

function decodeXmlEntities(value: string) {
  return decodeHtmlEntities(value).replace(/&apos;/gi, "'");
}

function collectHeadingText(html: string) {
  return [...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/gi)]
    .map((match) => cleanText(match[1]))
    .join(" ");
}

function getPageTokens(path: string, text: string) {
  const pathText = path.replace(/^\//, "").replace(/\//g, " ").replace(/[-_]/g, " ");
  return new Set(`${pathText} ${text}`
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !STOP_WORDS.has(token)));
}

function getSection(path: string) {
  const [, first = "home"] = path.split("/");
  return first || "home";
}

function pathToLabel(path: string) {
  if (path === "/") return "EdiCut homepage";
  return path.split("/").filter(Boolean).at(-1)?.replace(/[-_]/g, " ") ?? "EdiCut page";
}

function normalizePath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized || "/";
}

function uniquePaths(paths: string[]) {
  return [...new Set(paths.map(normalizePath))];
}

function makeIssue(path: string, code: string, severity: SeoAuditSeverity, message: string, recommendation: string): SeoAuditIssue {
  return { id: `${code}:${path}`, code, path, severity, message, recommendation };
}

function dedupeIssues(issues: SeoAuditIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
}

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value as number)));
}

async function mapWithConcurrency<T, R>(items: readonly T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}
