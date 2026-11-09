import { describe, expect, it } from "vitest";
import { filterIndexableSitemapPaths } from "./sitemap";

describe("SEO-managed sitemap entries", () => {
  it("omits no-index pages, non-canonical aliases, and enabled redirect sources", () => {
    const paths = ["/", "/contact", "/faq", "/terms", "/contact"];
    const filtered = filterIndexableSitemapPaths(paths, {
      pageOverrides: [
        { path: "/faq", indexable: false },
        { path: "/terms", canonicalPath: "/privacy" },
      ],
      redirects: [
        { from: "/contact", to: "/services", status: 301, enabled: true },
        { from: "/terms", to: "/privacy", status: 302, enabled: false },
      ],
    });

    expect(filtered).toEqual(["/"]);
  });

  it("keeps canonical pages with paused redirects", () => {
    expect(filterIndexableSitemapPaths(["/contact", "/faq"], {
      pageOverrides: [{ path: "/faq", indexable: true }],
      redirects: [{ from: "/contact", to: "/services", status: 302, enabled: false }],
    })).toEqual(["/contact", "/faq"]);
  });
});
