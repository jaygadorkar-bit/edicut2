import { describe, expect, it } from "vitest";
import { getCanonicalSiteRedirect } from "./site-redirects";

describe("getCanonicalSiteRedirect", () => {
  it("permanently redirects /about and preserves its query string", () => {
    const response = getCanonicalSiteRedirect(new Request("https://edicut.com/about/?ref=creator"));

    expect(response?.status).toBe(308);
    expect(response?.headers.get("Location")).toBe("https://edicut.com/why-hire-us?ref=creator");
  });

  it("combines the legacy path and www redirects into one canonical redirect", () => {
    const response = getCanonicalSiteRedirect(new Request("https://www.edicut.com/about?source=old"));

    expect(response?.status).toBe(308);
    expect(response?.headers.get("Location")).toBe("https://edicut.com/why-hire-us?source=old");
  });

  it("redirects other www URLs to the apex host", () => {
    const response = getCanonicalSiteRedirect(new Request("https://www.edicut.com/services?source=old"));

    expect(response?.status).toBe(308);
    expect(response?.headers.get("Location")).toBe("https://edicut.com/services?source=old");
  });

  it("does not redirect a POST to /about", () => {
    expect(getCanonicalSiteRedirect(new Request("https://edicut.com/about", { method: "POST" }))).toBeNull();
  });

  it("leaves unrelated apex URLs alone", () => {
    expect(getCanonicalSiteRedirect(new Request("https://edicut.com/services"))).toBeNull();
  });
});
