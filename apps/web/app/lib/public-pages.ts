import { SERVICE_PAGES } from "./services";

/** Keep discovery, prerendering, and indexing aligned for every public page. */
export const PUBLIC_PAGE_PATHS = [
  "/",
  "/why-hire-us",
  "/services",
  ...SERVICE_PAGES.map((service) => `/services/${service.slug}`),
  "/pricing",
  "/portfolio",
  "/faq",
  "/contact",
  "/privacy",
  "/terms",
  "/blog",
  // Keep this small: SEO helpers also run in the shared browser shell.
  // blog.test.ts checks that every article is registered here.
  "/blog/how-to-choose-youtube-video-editing-service",
  "/blog/youtube-video-editing-brief-checklist",
  "/blog/repurpose-youtube-videos-into-shorts",
  "/blog/3-reasons-why-you-should-hire-edicut",
  "/blog/youtube-audience-retention-editing-checklist",
  "/blog/video-podcast-editing-checklist",
];
