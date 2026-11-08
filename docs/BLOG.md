# EdiCut blog UI and hero media

The public blog index is `/blog`; articles share `/blog/:slug`. Blog navigation belongs in the shared footer, following the existing homepage header. Content lives in `apps/web/app/lib/blog.ts` and route metadata in `blog-seo.ts`.

Articles can have custom layouts. `/blog/3-reasons-why-you-should-hire-edicut`
uses `blog-hire-edicut.tsx` and `HireEdicutStory.tsx`: the actual unframed homepage
SVG film at the top, followed by three illustrated service, quality, and value
sections. Add each new article path to `PUBLIC_PAGE_PATHS`; it supplies the
public sitemap and prerender list. Keep full article copy out of this shared
path registry. `blog.test.ts` checks that every post has a registered path.
Follow [VIDEO_CREATION_GUIDE.md](VIDEO_CREATION_GUIDE.md) for narrated media;
reuse approved source audio when the requested video is the same film.

## Design conventions

- Follow `docs/TYPOGRAPHY.md`, `docs/MOBILE-HOMEPAGE.md`, and `apps/web/README.md`.
- Reuse DM Sans, global type roles, neomorphic surface tokens, shared navigation, buttons, and footer. Keep blog layout rules scoped to `blog.css` and hero rules to `blog-hero-video.css`.
- Article and card covers are authored, resolution-independent SVGs with intrinsic 3:2 dimensions. Social metadata keeps WebP fallbacks for platforms that do not reliably display SVG previews. Cards below the hero load lazily. The article contents panel highlights the visible chapter and becomes an inline panel on phones.

## Catalogue cards and cover artwork

Cards keep the open homepage-style layout, with a raised illustration, readable
title and short summary, then a footer aligned across each row. Titles and
summaries are never clipped. Single-card and phone views use natural title
height. Each whole card is one accessible link; the circular arrow is decorative.

Run `python scripts/create_blog_thumbnails.py` from the repository root to
regenerate the six current covers and their matching WebP social previews.
It uses fontTools/Brotli, the installed Sharp package, local DM Sans outlines,
and native SVG shapes. The EdiCut team cover includes the official local logo's
paths. The results have no embedded raster images, remote resources, or font
dependencies. Covers depict choosing an editor, a production checklist,
reframing a creator video into Shorts, the EdiCut editing team, an illustrative
retention review, and a two-speaker video podcast with synchronized tracks. Register
paths and descriptive alternative text in `app/lib/blog.ts`; keep the index's
social preview in `blog-seo.ts` aligned with its cover.
Give revised artwork a new public filename before release so long-lived cached
assets cannot keep an older illustration on the page.
The generator also retains the draft `long-video-to-shorts` URL as a compatibility
alias for the running development asset graph; cards use `creator-video-to-shorts`.

## Search-focused guides

`youtube-audience-retention-editing-checklist` addresses reviewing a published
video and turning observations into revision notes. `video-podcast-editing-checklist`
addresses recording handoff, sync, conversation edits, and delivery. Their intent
is separate from choosing an editing service, preparing a general brief, and
repurposing Shorts. Both use original editorial examples and link to the
relevant service, other guides, and current pricing. Official YouTube platform
facts are attributed inline and in each article's further-reading section.

When adding an article, register it in `public-pages.ts` and the production SEO
validator, supply an intrinsic SVG plus a WebP social fallback, and add contextual
links from relevant existing guides. Related articles prioritize the same topic
in the homepage-style horizontal `BlogRelatedSlider`. It shows every other guide
once, with snap scrolling, native touch swipes, mouse dragging, previous/next
buttons, a visible range, and Arrow/Home/End keyboard support. It respects reduced
motion and keeps ordinary article links usable without JavaScript. Review rendered metadata and structured data in the
browser, then run focused tests, web typecheck, and the production Cloudflare build.
New content remains local until a deployment publishes it.

## Optional prerecorded hero (legacy asset)

The current catalogue intentionally has no hero video. Do not add `VideoObject`
markup to the catalogue unless a video is visibly present there. The custom hire
EdiCut article reuses the interactive homepage SVG film instead of this MP4.

`BlogHeroVideo.tsx` reads the shared `BLOG_HERO_FILM` configuration. The local MP4 has native controls, inline playback, English captions, a poster, and a transcript. Playback is opt-in (`preload="none"`) and pauses offscreen or when the document is hidden. Reduced-motion preference replaces animation with a still and an audio player.

The film uses six new animated scenes made from the original blog covers and the approved homepage Nika narration/original music mix. It does not modify the source WAV. See `docs/WHY_HIRE_US_VOICEOVER.md` for that audio's provenance.

To regenerate, install Pillow, NumPy, fontTools with Brotli support, and imageio-ffmpeg in the local Python environment, then run `python scripts/create_blog_hero.py` from the repository root. The script validates the approved WAV hash, renders local DM Sans typography, and writes MP4, M4A, WebP, VTT, and a technical report under `apps/web/public/media/blog/`. Generated font intermediates and review frames belong in `artifacts/blog-hero-media/`.

After regeneration, keep `BLOG_HERO_FILM` duration, dimensions, transcript, and `uploadedAt` aligned with the report. Review all six scenes and captions, check playback and reduced-motion behavior, and run the web typecheck, focused static asset/SEO tests, and Cloudflare build. Worker asset routing permits the public MP4/M4A/WebP/VTT paths; Vite ignores root source recordings without ignoring `public/media/`.
