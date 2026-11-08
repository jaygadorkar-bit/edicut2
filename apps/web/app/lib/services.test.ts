import { describe, expect, it } from "vitest";
import { getServiceBySlug, SERVICE_PAGES } from "./services";

describe("public service content", () => {
  it("keeps published URLs and search snippets distinct", () => {
    const slugs = SERVICE_PAGES.map((service) => service.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(SERVICE_PAGES.map((service) => service.metaTitle)).size).toBe(slugs.length);
    expect(new Set(SERVICE_PAGES.map((service) => service.description)).size).toBe(slugs.length);

    for (const service of SERVICE_PAGES) {
      expect(service.slug).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
      expect(service.metaTitle.length).toBeLessThanOrEqual(75);
      expect(service.description.length).toBeLessThanOrEqual(180);
      expect(service.preparation.length).toBeGreaterThanOrEqual(3);
      expect(service.deliverables.length).toBeGreaterThanOrEqual(3);
      expect(service.questions.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("only links to other published services", () => {
    for (const service of SERVICE_PAGES) {
      expect(service.relatedSlugs.length).toBeGreaterThan(0);
      expect(new Set(service.relatedSlugs).size).toBe(service.relatedSlugs.length);
      for (const relatedSlug of service.relatedSlugs) {
        expect(relatedSlug).not.toBe(service.slug);
        expect(getServiceBySlug(relatedSlug)).toBeDefined();
      }
    }
  });

  it("positions the YouTube page as a done-for-you editor for creators", () => {
    const youtube = getServiceBySlug("youtube-video-editing");

    expect(youtube).toMatchObject({
      heading: "Hire a YouTube video editor for your channel",
      metaTitle: "YouTube Video Editor for Creators | EdiCut",
    });
    expect(youtube?.description).toMatch(/video editor for your YouTube channel/i);
    expect(youtube?.questions.some((item) => /editing app or a service/i.test(item.question))).toBe(true);
    expect(youtube?.questions.some((item) => /compare before hiring/i.test(item.question))).toBe(true);
  });

  it("does not resolve unknown or incomplete service paths", () => {
    expect(getServiceBySlug(undefined)).toBeUndefined();
    expect(getServiceBySlug("")).toBeUndefined();
    expect(getServiceBySlug("unknown-service")).toBeUndefined();
    expect(getServiceBySlug("youtube-video-editing/extra")).toBeUndefined();
  });
});
