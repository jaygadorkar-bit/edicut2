import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  values: {} as Record<string, string | undefined>,
  getSiteSettings: vi.fn(async (_db: unknown, keys: string[]) =>
    Object.fromEntries(keys.map((key) => [key, mocks.values[key]])),
  ),
  saveSiteSetting: vi.fn(async (_db: unknown, key: string, value: string) => {
    mocks.values[key] = value;
  }),
}));

vi.mock("./site-settings.server", () => ({
  getSiteSettings: mocks.getSiteSettings,
  saveSiteSetting: mocks.saveSiteSetting,
}));

import {
  deleteSeoPageOverride,
  getSeoAdminSettings,
  getSeoRedirectForPath,
  saveSeoPageOverride,
  saveSeoGlobalMetadata,
  saveSeoRedirect,
  SeoSettingsValidationError,
  validateInternalRoutePath,
  validateSeoPageOverride,
  validateSeoGlobalMetadata,
  validateSeoRedirect,
} from "./seo-admin.server";
import { DEFAULT_SEO_DESCRIPTION } from "./seo";

beforeEach(() => {
  mocks.values = {};
  vi.clearAllMocks();
});

describe("SEO admin settings", () => {
  it("normalizes and persists bounded metadata overrides", async () => {
    const saved = await saveSeoPageOverride(null, {
      path: "/contact/",
      title: "  Contact EdiCut  ",
      description: "Talk to our video editing team.",
      canonicalPath: "/contact",
      socialImageUrl: "/images/contact-share.png",
      indexable: false,
    });

    expect(saved).toEqual({
      path: "/contact",
      title: "Contact EdiCut",
      description: "Talk to our video editing team.",
      canonicalPath: "/contact",
      socialImageUrl: "/images/contact-share.png",
      indexable: false,
    });
    expect(mocks.values.seo_page_overrides_v1).toBe(JSON.stringify([saved]));
    await expect(getSeoAdminSettings(null)).resolves.toMatchObject({
      globalMetadata: { titleTemplate: "%s | EdiCut", defaultDescription: DEFAULT_SEO_DESCRIPTION },
      pageOverrides: [saved],
    });
  });

  it("round-trips separate global metadata settings", async () => {
    const settings = {
      titleTemplate: "%s | EdiCut video editing",
      defaultDescription: "Video editing for creators, with a clear review and delivery workflow.",
    };
    await expect(saveSeoGlobalMetadata(null, settings)).resolves.toEqual(settings);
    expect(mocks.values.seo_global_metadata_v1).toBe(JSON.stringify(settings));
    await expect(getSeoAdminSettings(null)).resolves.toMatchObject({ globalMetadata: settings });
  });

  it("replaces one override per route and supports deleting it", async () => {
    await saveSeoPageOverride(null, { path: "/contact", title: "Contact EdiCut" });
    await saveSeoPageOverride(null, { path: "/contact", title: "Contact EdiCut Team" });
    expect(JSON.parse(mocks.values.seo_page_overrides_v1 ?? "[]")).toHaveLength(1);
    await deleteSeoPageOverride(null, "/contact/");
    expect(mocks.values.seo_page_overrides_v1).toBe("[]");
  });

  it("accepts safe local redirects, resolves only enabled rules, and rejects loops", async () => {
    await saveSeoRedirect(null, { from: "/old-editing", to: "/services/youtube-video-editing", status: 301, enabled: true });
    await saveSeoRedirect(null, { from: "/paused", to: "/contact", status: 302, enabled: false });

    await expect(getSeoRedirectForPath(null, "/old-editing/")).resolves.toMatchObject({
      from: "/old-editing",
      to: "/services/youtube-video-editing",
      status: 301,
    });
    await expect(getSeoRedirectForPath(null, "/paused")).resolves.toBeUndefined();
    await expect(saveSeoRedirect(null, { from: "/services/youtube-video-editing", to: "/old-editing", status: 302, enabled: true }))
      .rejects.toThrow("redirect loop");
  });

  it.each([
    "https://attacker.example/path",
    "//attacker.example/path",
    "/admin/../login",
    "/old?next=/contact",
    "/old#fragment",
    "/old/%2fadmin",
    "/old\\admin",
  ])("rejects unsafe internal route path %s", (path) => {
    expect(() => validateInternalRoutePath(path)).toThrow(SeoSettingsValidationError);
  });

  it("rejects metadata outside known public pages and unsafe social-image schemes", () => {
    expect(() => validateSeoPageOverride({ path: "/site/node-logmin", title: "Admin" })).toThrow("published public page");
    expect(() => validateSeoPageOverride({ path: "/contact", title: "Contact", socialImageUrl: "javascript:alert(1)" }))
      .toThrow(SeoSettingsValidationError);
    expect(() => validateSeoPageOverride({ path: "/contact", description: "x".repeat(321) }))
      .toThrow("320 characters or fewer");
  });

  it("validates page social metadata and focus keyword lengths", () => {
    const override = validateSeoPageOverride({
      path: "/contact",
      socialTitle: "Talk to the EdiCut team",
      socialDescription: "Share your project details and we will help plan your next edit.",
      focusKeyword: "video editing service",
    });
    expect(override).toMatchObject({
      socialTitle: "Talk to the EdiCut team",
      socialDescription: "Share your project details and we will help plan your next edit.",
      focusKeyword: "video editing service",
    });
    expect(() => validateSeoPageOverride({ path: "/contact", socialTitle: "x".repeat(71) }))
      .toThrow("Social title must be 70 characters or fewer");
    expect(() => validateSeoPageOverride({ path: "/contact", socialDescription: "x".repeat(201) }))
      .toThrow("Social description must be 200 characters or fewer");
    expect(() => validateSeoPageOverride({ path: "/contact", focusKeyword: "x".repeat(101) }))
      .toThrow("Focus keyword must be 100 characters or fewer");
  });

  it("requires a bounded global title template with the page-title placeholder and a default description", () => {
    expect(validateSeoGlobalMetadata({
      titleTemplate: "%s | EdiCut",
      defaultDescription: "Video editing for creators.",
    })).toEqual({ titleTemplate: "%s | EdiCut", defaultDescription: "Video editing for creators." });
    expect(() => validateSeoGlobalMetadata({ titleTemplate: "EdiCut", defaultDescription: "Description" }))
      .toThrow("must include the %s page-title placeholder");
    expect(() => validateSeoGlobalMetadata({ titleTemplate: `${"%s"}${"x".repeat(99)}`, defaultDescription: "Description" }))
      .toThrow("Title template must be 100 characters or fewer");
    expect(() => validateSeoGlobalMetadata({ titleTemplate: "%s | EdiCut", defaultDescription: "x".repeat(321) }))
      .toThrow("Default description must be 320 characters or fewer");
  });

  it("rejects redirects to admin routes and unsupported status codes", () => {
    expect(() => validateSeoRedirect({ from: "/old", to: "/site/node-logmin", status: 301, enabled: true }))
      .toThrow("Admin and API");
    expect(() => validateSeoRedirect({ from: "/old", to: "/new", status: 300 as 301, enabled: true }))
      .toThrow("supported redirect status");
  });

  it("fails safely when stored JSON is malformed or oversized", async () => {
    mocks.values.seo_page_overrides_v1 = "{not-json";
    mocks.values.seo_redirects_v1 = "[" + " ".repeat(64 * 1024) + "]";
    await expect(getSeoAdminSettings(null)).resolves.toMatchObject({
      globalMetadata: { titleTemplate: "%s | EdiCut", defaultDescription: DEFAULT_SEO_DESCRIPTION },
      pageOverrides: [],
      redirects: [],
    });
  });

  it("does not swallow a database read failure before saving", async () => {
    mocks.getSiteSettings.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(saveSeoPageOverride(null, { path: "/contact", title: "Contact" })).rejects.toThrow("database unavailable");
    expect(mocks.saveSiteSetting).not.toHaveBeenCalled();
  });
});
