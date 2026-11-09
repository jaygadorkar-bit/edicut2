// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SeoManagerPanel,
  type SeoManagerPanelProps,
} from "./SeoManagerPanel";

const page: SeoManagerPanelProps["pages"][number] = {
  id: "home",
  path: "/",
  label: "Home page",
  defaults: {
    title: "EdiCut video editing services",
    description: "Professional video editing for creators and businesses.",
    canonicalUrl: "https://edicut.com/",
    indexable: true,
    socialTitle: "EdiCut video editing services",
    socialDescription: "Professional video editing for creators and businesses.",
    socialImageUrl: "https://edicut.com/images/home-share.jpg",
  },
  overrides: {
    title: "Video editing services | EdiCut",
    focusKeyword: "video editing services",
  },
};

const baseProps: SeoManagerPanelProps = {
  pages: [page],
  findings: [],
  redirects: [],
  notFoundPaths: [],
  searchConsole: { status: "not-connected" },
  internalLinkSuggestions: [],
  globalSettings: {
    titleTemplate: "%s | EdiCut",
    defaultDescription: "Video editing for creators and businesses.",
    allowIndexing: true,
  },
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(props: SeoManagerPanelProps = baseProps) {
  const router = createMemoryRouter([{ path: "/admin/seo", element: createElement(SeoManagerPanel, props) }], { initialEntries: ["/admin/seo"] });
  await act(async () => root.render(createElement(RouterProvider, { router })));
}

async function openSection(id: "overview" | "pages" | "health" | "redirects" | "search-console" | "internal-links") {
  const tab = host.querySelector<HTMLButtonElement>(`#seo-tab-${id}`);
  if (!tab) throw new Error(`Missing ${id} tab`);
  await act(async () => tab.click());
}

describe("SeoManagerPanel", () => {
  it("renders the overview, honest empty health state, and explicit audit form intent", async () => {
    await render();
    expect(host.textContent).toContain("SEO");
    expect(host.textContent).toContain("Pages managed");
    expect(host.textContent).toContain("No scan recorded");
    expect(host.textContent).toContain("Run a health check to scan the site.");
    expect(host.querySelector('form input[name="intent"][value="run-audit"]')).not.toBeNull();
    expect(host.querySelector('[role="tablist"]')).not.toBeNull();
  });

  it("edits only saved page overrides and previews inherited catalog defaults", async () => {
    await render();
    await openSection("pages");

    expect(host.querySelector<HTMLInputElement>('input[name="title"]')?.value).toBe("Video editing services | EdiCut");
    expect(host.querySelector<HTMLTextAreaElement>('textarea[name="description"]')?.value).toBe("");
    expect(host.textContent).toContain("Leave blank to use the page’s current description: Professional video editing for creators and businesses.");
    expect(host.textContent).toContain("Video editing services | EdiCut");
    expect(host.textContent).toContain("Professional video editing for creators and businesses.");
    const socialPreview = host.querySelector("#seo-social-preview-title")?.closest("section");
    expect(socialPreview?.textContent).toContain("Video editing services | EdiCut");
    expect(host.querySelector('form input[name="intent"][value="save-page-metadata"]')).not.toBeNull();
    expect(host.querySelector('form input[name="intent"][value="delete-page-metadata"]')).not.toBeNull();
    expect(host.textContent).toContain("Reset to page defaults");
  });

  it("links to the EdiCut Search Console property without inventing connection data", async () => {
    await render();
    await openSection("search-console");

    expect(host.textContent).toContain("Search Console is not connected");
    expect(host.textContent).toContain("Metrics will appear here after the route receives connected data.");
    expect(host.querySelector('a[href="https://search.google.com/search-console?resource_id=sc-domain%3Aedicut.com"]')?.textContent).toContain("Open EdiCut property");
    expect(host.querySelector('form input[name="intent"][value*="search-console"]')).toBeNull();
  });

  it("shows connected Search Console metrics only when supplied by the route", async () => {
    await render({
      ...baseProps,
      searchConsole: {
        status: "connected",
        propertyUrl: "sc-domain:edicut.com",
        lastSyncedAt: "2026-11-08T12:00:00.000Z",
        clicks: { current: 42, previous: 35 },
        impressions: { current: 900, previous: 850 },
        averagePosition: { current: 8.2, previous: 9.1 },
        queries: [{ label: "video editing services", clicks: 42, impressions: 900, position: 8.2 }],
        pages: [{ label: "https://edicut.com/", clicks: 42, impressions: 900, position: 8.2 }],
      },
    });
    await openSection("search-console");

    expect(host.textContent).toContain("Google Search Console connected");
    expect(host.textContent).toContain("Top search queries");
    expect(host.textContent).toContain("42");
    expect(host.textContent).toContain("900");
    expect(host.querySelector('form input[name="intent"][value*="search-console"]')).toBeNull();
  });

  it("explains that request-level 404 tracking is not configured and supports redirect source prefill", async () => {
    await render({ ...baseProps, notFoundPaths: [{ path: "/missing-page", occurrences: 3 }] });
    await openSection("redirects");

    expect(host.textContent).toContain("Not-found requests");
    expect(host.textContent).toContain("3 requests");
    expect(host.textContent).not.toContain("Hits");
    const useSource = host.querySelector<HTMLButtonElement>('button[aria-label="Use /missing-page as redirect source"]');
    if (!useSource) throw new Error("Missing redirect source prefill action");
    await act(async () => useSource.click());
    expect(host.querySelector<HTMLInputElement>('input[name="sourcePath"]')?.value).toBe("/missing-page");

    await render({ ...baseProps, notFoundPaths: [] });
    await openSection("redirects");
    expect(host.textContent).toContain("Request-level 404 tracking is not configured");
  });

  it("renders internal link suggestions as read-only source and target links", async () => {
    await render({
      ...baseProps,
      internalLinkSuggestions: [{
        id: "suggestion-1",
        sourcePath: "/services",
        targetPath: "/pricing",
        anchorText: "video editing packages",
        reason: "These existing pages cover related service and pricing topics.",
      }],
    });
    await openSection("internal-links");

    expect(host.textContent).toContain("Review suggestions and edit page content manually.");
    expect(host.querySelector('a[href="/services"]')?.textContent).toContain("Source");
    expect(host.querySelector('a[href="/pricing"]')?.textContent).toContain("Target");
    expect(host.textContent).toContain("Review only");
    expect(host.querySelector('form input[name="intent"][value="apply-internal-link"]')).toBeNull();
  });

  it("supports arrow-key navigation between tabs", async () => {
    await render();
    const overviewTab = host.querySelector<HTMLButtonElement>("#seo-tab-overview");
    if (!overviewTab) throw new Error("Missing overview tab");
    await act(async () => overviewTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(host.querySelector("#seo-tab-pages")?.getAttribute("aria-selected")).toBe("true");
    expect(host.querySelector("#seo-tab-pages")).toBe(document.activeElement);
  });
});
