import { describe, expect, it } from "vitest";
import {
  createPageMeta,
  createRouteMeta,
  createSiteStructuredData,
  escapeXml,
  getCanonicalSiteOrigin,
  getCanonicalUrl,
  isIndexablePublicPath,
  shouldIndexPage,
  serializeJsonLd,
} from "./seo";

describe("SEO helpers", () => {
  it("uses the production origin when the configured URL is local", () => {
    expect(getCanonicalSiteOrigin("http://localhost:3002")).toBe("https://edicut.com");
    expect(getCanonicalUrl("http://127.0.0.1:3002", "/pricing/creator/")).toBe(
      "https://edicut.com/pricing/creator",
    );
  });

  it("normalizes the www production hostname to the canonical host", () => {
    expect(getCanonicalSiteOrigin("https://www.edicut.com/")).toBe("https://edicut.com");
  });

  it("allows only public marketing and policy routes to be indexed", () => {
    expect(isIndexablePublicPath("/")).toBe(true);
    expect(isIndexablePublicPath("/pricing/creator")).toBe(true);
    expect(isIndexablePublicPath("/dashboard")).toBe(false);
    expect(isIndexablePublicPath("/checkout/creator")).toBe(false);
    expect(isIndexablePublicPath("/pricing/creator/extra")).toBe(false);
  });

  it("disables indexing for local, maintenance, or explicitly disabled environments", () => {
    expect(shouldIndexPage({ pathname: "/", crawlingEnabled: true, maintenanceModeEnabled: false, appUrl: "http://localhost:3002" })).toBe(false);
    expect(shouldIndexPage({ pathname: "/", crawlingEnabled: true, maintenanceModeEnabled: false, appUrl: "https://preview.edicut.com" })).toBe(false);
    expect(shouldIndexPage({ pathname: "/", crawlingEnabled: false, maintenanceModeEnabled: false, appUrl: "https://edicut.com" })).toBe(false);
    expect(shouldIndexPage({ pathname: "/", crawlingEnabled: true, maintenanceModeEnabled: true, appUrl: "https://edicut.com" })).toBe(false);
    expect(shouldIndexPage({ pathname: "/", crawlingEnabled: true, maintenanceModeEnabled: false, appUrl: "https://edicut.com" })).toBe(true);
    expect(shouldIndexPage({ pathname: "/", crawlingEnabled: true, maintenanceModeEnabled: false, appUrl: "https://www.edicut.com" })).toBe(true);
    expect(getCanonicalSiteOrigin("https://preview.edicut.com")).toBe("https://edicut.com");
  });

  it("escapes sitemap XML and emits page-specific search and social metadata", () => {
    expect(escapeXml('https://edicut.com/?a=1&b="two"')).toBe(
      "https://edicut.com/?a=1&amp;b=&quot;two&quot;",
    );

    const meta = createPageMeta("Contact EdiCut", "Talk to our team.", {
      appUrl: "https://edicut.com",
      pathname: "/contact",
    });
    expect(meta).toContainEqual({ title: "Contact EdiCut" });
    expect(meta).toContainEqual({ name: "description", content: "Talk to our team." });
    expect(meta).toContainEqual({ property: "og:title", content: "Contact EdiCut" });
    expect(meta).toContainEqual({ name: "twitter:description", content: "Talk to our team." });
    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://edicut.com/contact" });
    expect(meta).toContainEqual({ name: "robots", content: "index, follow" });
  });

  it("adds canonical and noindex metadata to local-rendered route metadata", () => {
    const meta = createRouteMeta({
      location: { pathname: "/contact" },
      matches: [{
        id: "root",
        data: {
          appUrl: "http://localhost:3002",
          searchCrawlingEnabled: true,
          maintenanceModeEnabled: false,
        },
      }],
    }, "Contact EdiCut", "Talk to our team.");

    expect(meta).toContainEqual({ tagName: "link", rel: "canonical", href: "https://edicut.com/contact" });
    expect(meta).toContainEqual({ name: "robots", content: "noindex, nofollow, noarchive" });
  });

  it("creates safe organization and website structured data for the canonical site", () => {
    const schema = createSiteStructuredData("http://localhost:3002");
    const graph = schema["@graph"];

    expect(schema["@context"]).toBe("https://schema.org");
    expect(graph[0]).toMatchObject({ "@type": "Organization", url: "https://edicut.com/" });
    expect(graph[1]).toMatchObject({ "@type": "WebSite", url: "https://edicut.com/" });
    expect(serializeJsonLd({ name: "</script>" })).toContain("\\u003c/script>");
  });
});
