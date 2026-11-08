# EdiCut blog homepage and video audit

Date: 2026-10-22  
Scope: Blog index and all three articles, narrated hero media, responsive support behavior, Worker media routing, and SEO preservation. The implementation was split across three Luna subagents for design polish, media production, and an independent source audit. Browser and build validation were completed by the implementation owner.

## Findings

| Priority | Finding | Recommendation |
|---|---|---|
| Resolved | The English WebVTT omitted the opening music-only second. | Added a synchronized `[Soft instrumental music]` cue. The remaining cues align with the spoken transcript. |
| Resolved | The Worker media-routing test constructed a guessed M4A path instead of the configured asset. | The test now imports `BLOG_HERO_FILM` and checks the concrete MP4, M4A, poster, and VTT paths against the allowlist. |

The follow-up source review found no remaining substantive UI, accessibility, security, or logic defects within the reviewed scope. The runtime and build checks below passed. This is a scoped local review, not a claim of exhaustive coverage.

## Reviewed positively

- Blog typography uses existing EdiCut font/type classes and the homepage-aligned display scale; responsive title sizing and whitespace below the film are scoped to blog styles.
- The mobile floating support launcher is hidden on blog pages below 640px; the shared mobile menu support card remains available. Blog stays out of the header navigation, preserving the SEO audit decision to link it in the footer only.
- The film has no autoplay and uses `preload="none"`; controls and inline playback are enabled. The transcript is available in a disclosure. Reduced-motion mode swaps to a static poster with opt-in audio, and media pauses when the tab is hidden or the stage leaves the viewport.
- Hero media uses intrinsic dimensions, a small poster, and local H.264/AAC plus AAC fallback. No third-party player is introduced.
- Blog title/description, canonical/schema helpers, article H1/breadcrumb/byline structure, article-specific hero artwork, and public route registration remain separate from the new index film.
- Worker media routing is limited to GET/HEAD and `/media/blog/` file extensions `mp4`, `m4a`, `vtt`, and `webp`; its tests reject POST and non-media JSON.

## Validation status

- Source review: complete.
- Codex in-app browser, with visible rendering: all four routes checked at 320, 390, 768, 1258, and 1440 pixels. No horizontal overflow or broken loaded artwork; exactly one H1 per page. Blog remains in the footer and out of the header.
- Film playback: unmuted playback, visible English captions, natural completion, replay, and automatic offscreen pause passed. Reduced-motion emulation replaced video with still artwork and working audio playback. The transcript opens and contains all six narration paragraphs.
- Article interactions: keyboard chapter navigation scrolls to the intended section below the sticky header and updates `aria-current="location"`. FAQ summaries open and close with Enter, with a visible focus outline.
- `pnpm --filter @edicut/web typecheck`: passed after final source edits.
- `pnpm exec vitest run apps/web/app/lib/seo.test.ts apps/web/app/lib/services.test.ts apps/web/workers/static-assets.test.ts apps/web/workers/security-headers.test.ts`: 4 files, 42 tests passed.
- `pnpm --filter @edicut/web build:cloudflare`: passed after final source/media changes. The production SEO validator passed for all 24 public pages, including the blog and three articles.
- Additional built-HTML assertions: correct production canonicals, indexable robots and one H1 on all four blog routes; VideoObject only on the index with the actual final media timestamp, duration, and asset URLs. All four built media assets match source bytes.
- Local HTTP checks: MP4, M4A, WebP, and VTT return 200 with correct MIME types. MP4 byte-range request returned 206 with the requested 1,024 bytes. The Vite watcher rule was narrowed to root source recordings so it no longer excludes public media.
- Python AST parsing and scoped `git diff --check`: passed. No supported lint script is configured in this repository, as documented in the web README.
- One transient React Router HMR navigation abort was recorded while the Vite configuration restarted; subsequent page/player checks completed without new application errors.

## Media provenance and review

- Final film: 1280×720, 24 fps H.264/AAC, approximately 38 seconds, 1,056,762 bytes. No autoplay; poster is about 28 KB.
- Six newly rendered scenes use the original blog covers and local DM Sans. Descriptions wrap within a measured 450-pixel column; all six final scenes were visually reviewed.
- Audio reuses the approved existing homepage Nika narration and original music mix. No new voice synthesis or external paid generation was used. The original WAV remains unchanged (SHA-256 `f39072477122e7c06d0da070769b57afa8834ad47c3feaace415982dda364f96`).
- The AAC audio alternative measures 37.64 seconds, peak −1.412 dBFS after decoding, and zero clipped samples. See the public technical report and `docs/BLOG.md` for regeneration instructions.

## Changed files for this polish

- `apps/web/app/routes/blog.tsx` and `blog-post.tsx`.
- `apps/web/app/components/site/Blog.tsx`, `BlogContents.tsx`, and `BlogHeroVideo.tsx`.
- `apps/web/app/styles/blog.css` and `blog-hero-video.css`.
- `apps/web/app/lib/blog-hero.ts` and `blog-seo.ts`.
- `apps/web/workers/static-assets.ts`, `static-assets.test.ts`, and `apps/web/vite.config.ts`.
- `scripts/create_blog_hero.py`, `apps/web/public/media/blog/*`, and `docs/BLOG.md`.

## Evidence and release scope

- Responsive/playback evidence: `artifacts/blog-polish-browser-checks-2026-10-22.json`.
- Production HTML/media assertions: `artifacts/blog-polish-build-checks-2026-10-22.json`.
- Screenshots: `artifacts/blog-polished-*.png`; final six-scene contact sheet: `artifacts/blog-hero-media/scene-contact-sheet-final.png`.
- Changes are available on localhost. No production deployment or database changes were made for this UI task. Recommended follow-up: review the local film and publish the reviewed workspace when ready; cross-device audio presentation may vary with browser controls and the listener's volume settings.

## References

- `apps/web/README.md` performance and styling conventions.
- `docs/TYPOGRAPHY.md` shared type roles and sizes.
- `docs/MOBILE-HOMEPAGE.md` phone support-widget behavior and scoping rules.
- `docs/WHY_HIRE_US_VOICEOVER.md` narration, captions, reduced-motion, and pause behavior precedent.
- `artifacts/blog-seo-audit-2026-10-22.md` metadata, route discovery, and footer-only Blog navigation constraints.
