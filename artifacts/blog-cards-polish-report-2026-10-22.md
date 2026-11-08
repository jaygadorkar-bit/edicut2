# Blog card and SVG thumbnail polish

22 October 2026. Scope: `/blog`, the shared article cards, and cover/social artwork.

## Changes

- Kept the existing neomorphic palette, DM Sans, open catalogue layout, and
  portfolio-style category control. Improved thumbnail framing, typography,
  summary length, spacing, and the reading link with a raised circular arrow.
- Card footers align across desktop/tablet rows. Phone and single-card views
  use natural title height. Full titles and summaries remain visible.
- Every card is one accessible link with a descriptive title, visible keyboard
  focus, and clearance for the sticky header. Arrows are decorative.
- Created four topic-specific native SVG covers: choosing an editor, a video
  brief/checklist, a creator video repurposed into Shorts, and EdiCut's team,
  review, and package scope. Local DM Sans is outlined; the team artwork embeds
  the official logo's vector paths. No raster images or remote fonts are embedded.
- Updated cover paths, alternative text, summaries, and WebP social previews.
  The old published artwork files remain available. The generator retains one
  draft Shorts filename as a compatibility alias for Vite's observed asset graph.

## Main files

- `apps/web/app/components/site/Blog.tsx`
- `apps/web/app/styles/blog.css`
- `apps/web/app/lib/blog.ts`
- `apps/web/app/lib/blog-seo.ts`
- `apps/web/public/images/blog/{choose-editing-partner,video-brief-checklist,creator-video-to-shorts,edicut-editing-team}.{svg,webp}`
- `scripts/create_blog_thumbnails.py`
- `docs/BLOG.md`

## Validation

- `python scripts/create_blog_thumbnails.py`: passed; reproducible local artwork
  generation and matching 1536×1024 WebP previews.
- SVG/XML checks: native paths/shapes only, 1536×1024 intrinsic size, no scripts,
  embedded images, foreign objects, external resources, or font dependency.
  Gzipped SVG sizes range from 7.5 to 15.7 KB.
- `pnpm --filter @edicut/web typecheck`: passed.
- `pnpm exec vitest run apps/web/app/lib/blog.test.ts apps/web/app/lib/seo.test.ts apps/web/workers/static-assets.test.ts`:
  3 files and 19 tests passed.
- `pnpm --filter @edicut/web build:cloudflare`: passed, including production
  prerender SEO validation for 25 public pages.
- Built catalogue checks: four current SVG images and card footers, matching
  current social image, one H1, index/follow metadata, no phantom video schema.
- Browser checks at 1057, 768, 390, and 375 CSS pixels: no page overflow,
  loaded thumbnails, full titles, consistent row footers, working category filter,
  one link per card, and a visible 3px red keyboard outline. At 1057px, all first-row
  footer tops measured 621.0625px; at 768px both pairs aligned within their rows.
- Clicked the production brief card and confirmed its article, current SVG,
  H1, and self-canonical URL. Shared reduced-motion rules cover the new transitions
  (source reviewed). Fresh browser inspection reported no console warnings/errors.
- During artwork iteration, removing a draft asset briefly broke Vite's cached
  CSS asset graph. Restored a compatibility alias, verified global CSS returned
  HTTP 200 with text/css, reloaded, and repeated the styled phone/focus checks.
- `git diff --check` for the tracked files in scope: passed. No supported lint
  script is configured in this repository.

## Evidence and release state

Desktop/phone screenshots, responsive measurements, typecheck log, and build log
are saved beside this report with the `blog-cards-` prefix. The changes are ready
locally; this task did not deploy or modify production data.
