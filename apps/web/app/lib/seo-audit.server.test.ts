import { describe, expect, it, vi } from "vitest";
import { PUBLIC_PAGE_PATHS } from "./public-pages";
import { findInternalLinkSuggestions, runSeoTechnicalAudit } from "./seo-audit.server";

const sitemap = `<?xml version="1.0"?><urlset>${PUBLIC_PAGE_PATHS
  .map((path) => `<url><loc>https://edicut.com${path}</loc></url>`)
  .join("")}</urlset>`;

function makeFetch(pageResponse: (url: URL) => Response) {
  const requests: URL[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof URL ? input.toString() : String(input));
    requests.push(url);
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nAllow: /\nSitemap: https://edicut.com/sitemap.xml\n", { status: 200 });
    }
    if (url.pathname === "/sitemap.xml") {
      return new Response(sitemap, { status: 200, headers: { "Content-Type": "application/xml" } });
    }
    return pageResponse(url);
  });
  return { fetchImpl, requests };
}

describe("SEO technical audit", () => {
  it("checks public HTML, crawler files, and reports metadata without returning markup", async () => {
    const html = `<!doctype html>
      <html><head>
        <title>EdiCut video editing services</title>
        <meta name="description" content="Video editing services for creators who need a reliable editing partner and polished videos every month.">
        <link rel="canonical" href="https://edicut.com/">
      </head><body><h1>Video editing services</h1>
        <a href="/services/youtube-video-editing">YouTube editing service</a>
        <img src="/hero.webp" alt="Video editor working on a timeline">
      </body></html>`;
    const { fetchImpl, requests } = makeFetch(() => new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }));

    const result = await runSeoTechnicalAudit({ fetchImpl, maxPages: 1 });

    expect(result.origin).toBe("https://edicut.com");
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({
      path: "/",
      status: 200,
      title: "EdiCut video editing services",
      canonical: "https://edicut.com/",
      h1Count: 1,
      imageCount: 1,
      imagesMissingAlt: 0,
      internalLinks: ["/services/youtube-video-editing"],
    });
    expect(result.pages[0]).not.toHaveProperty("html");
    expect(result.pages[0].issues).toEqual([]);
    expect(result.robots).toMatchObject({ status: 200, hasSitemapReference: true, disallowsAll: false });
    expect(result.sitemap).toMatchObject({ status: 200, urlCount: PUBLIC_PAGE_PATHS.length, missingPublicPaths: [] });
    expect(result.limits).toMatchObject({ requestedPageCount: PUBLIC_PAGE_PATHS.length, auditedPageCount: 1, truncatedHtmlPages: 0 });
    expect(requests.every((url) => url.hostname === "edicut.com" && url.protocol === "https:")).toBe(true);
  });

  it("does not follow a redirect outside the owned EdiCut origin", async () => {
    const { fetchImpl, requests } = makeFetch((url) => url.pathname === "/"
      ? new Response(null, { status: 302, headers: { location: "https://attacker.example/collect" } })
      : new Response("Not found", { status: 404 }));

    const result = await runSeoTechnicalAudit({ fetchImpl, maxPages: 1 });

    expect(result.pages[0].issues.map(({ code }) => code)).toContain("unsafe_redirect");
    expect(requests.some((url) => url.hostname === "attacker.example")).toBe(false);
  });

  it("creates repeatable contextual suggestions and prioritizes orphaned target pages", () => {
    const pages = [
      { path: "/blog/video-podcast-editing-checklist", title: "Video podcast editing checklist", status: 200, internalLinks: [] },
      { path: "/services/podcast-editing", title: "Podcast editing service", status: 200, internalLinks: [] },
      { path: "/services/youtube-video-editing", title: "YouTube editing service", status: 200, internalLinks: [] },
    ];

    const suggestions = findInternalLinkSuggestions(pages, 2);

    expect(suggestions[0]).toMatchObject({
      sourcePath: "/blog/video-podcast-editing-checklist",
      targetPath: "/services/podcast-editing",
      relatedTerms: expect.arrayContaining(["podcast"]),
    });
    expect(suggestions[0].reason).toContain("no incoming links");
    expect(suggestions).toEqual(findInternalLinkSuggestions(pages, 2));
  });
});
