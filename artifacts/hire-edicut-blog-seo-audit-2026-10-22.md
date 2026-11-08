# EdiCut hire article: SEO and production review

Reviewed 22 October 2026 with the `seo-audit` skill. Scope: the new custom
article, its discovery paths, and the reusable video/audio production workflow.
This is a local and production-build review, not a live indexing report.

## Implemented

- Custom route `/blog/3-reasons-why-you-should-hire-edicut`, with one H1,
  the real unframed homepage SVG/audio film, and three illustrated reasons:
  managed service/tools, editorial quality/review, and package value/scope.
- Distinct title `EdiCut Video Editing: 3 Reasons for Creators`, descriptive
  metadata, self-canonical URL, Open Graph/Twitter WebP fallback, visible
  authorship/date, BlogPosting data, and breadcrumb data. The service keyword
  appears naturally in the opening paragraph.
- Links to the YouTube service, portfolio, current pricing, contact, and related
  guides. Added a contextual inbound link from the editing-service comparison
  article. The blog catalogue lists the article under Inside EdiCut.
- Added the public path to sitemap/prerender registration. The small shared
  path registry does not import the full article catalogue into the global shell.
- New SVG catalogue cover and WebP social image. The article uses native SVG
  artwork and existing approved assets; it adds no new font or duplicate audio.
- Added `docs/VIDEO_CREATION_GUIDE.md`, linked from README and both film docs:
  normal AI Studio download, a fresh official API take when download is
  unavailable, safe one-session credential handoff, source/hash preservation,
  take-specific timing, music mixing, browser playback, and review steps for Luna.

## Issues found and corrected

1. The catalogue's JSON-LD described a hero video that is no longer visible.
   Removed the VideoObject and its subjectOf reference; catalogue UI is unchanged.
2. Generic blog button padding overrode the film's sound-control padding,
   squeezing its icon to 2 CSS pixels. Excluded the film controls from that rule.
   Rechecked: sound control 44×44, icon 18px; play control 116×44.
3. Author links targeted a removed editorial-team section. Changed visible
   article author links and the author schema URL to the existing blog page.
4. The existing artwork test assumed a repository-root working directory.
   It now resolves assets relative to the test module and works from both roots.

## Validation

- `pnpm --filter @edicut/web typecheck`: passed.
- `pnpm exec vitest run apps/web/app/lib/blog.test.ts apps/web/app/lib/seo.test.ts apps/web/app/components/site/why-hire-us-film-timeline.test.ts apps/web/workers/static-assets.test.ts`:
  4 files, 27 tests passed.
- `pnpm --filter @edicut/web build:cloudflare`: passed; production prerender SEO
  validator passed for 25 public pages, including the new route.
- Built HTML review: one H1, self-canonical, index/follow, BlogPosting and
  breadcrumbs, social fallback, catalogue link, contextual inbound link,
  existing referenced media, no localhost origin, no phantom catalogue video.
- Browser DOM inspection confirmed metadata and rendered JSON-LD, footer-only
  blog navigation, one H1, all three sections, and working category filtering.
- Responsive checks at 1280, 768, 390, and 375 CSS pixels found no horizontal
  page overflow. Phone artwork label bounds fit their SVG canvas.
- Actual film play, replay, mute, 37.64-second audio duration, and offscreen
  pause were checked. Initial audio readyState 0 with preload none. The film
  container has a transparent background and no box shadow. Shared reduced-motion
  rules retain static scenes and disable transforms; these were source-reviewed.
- A fresh browser load reported no console warnings/errors. A historical
  development HMR hydration message referenced copy edited during the session;
  current SSR HTML and the clean load both contain the final copy.
- Python compilation and local-only handoff checks passed: password field,
  no-store/CSP, origin rejection, invalid-key rejection, idle expiry, mocked WAV
  generation, metadata/hash, credential non-persistence, and overwrite rejection.
  No new Google generation or API credential was required for this article.
- `git diff --check` on the tracked files touched by this task passed.

## Limits and follow-up

The localhost preview correctly stays noindex; the production build is
indexable. No deployment, Search Console submission, ranking change, external
rich-results validation, or field Core Web Vitals measurement is claimed.
After the approved release, verify the live page and sitemap, then request
indexing and review Search Console impressions/clicks for the article.

Evidence: `hire-edicut-blog-browser-audit-2026-10-22.json`,
`hire-edicut-blog-build-audit-2026-10-22.json`, the desktop/mobile PNGs, and
`hire-edicut-build-2026-10-22.log` in this directory.
