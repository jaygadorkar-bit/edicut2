# Two new EdiCut guides — implementation and SEO review

Date: 23 October 2026. Release status: local source and production build ready;
these two articles have not been deployed in this task.

## Content and search intent

| Article | Primary query / intent | Editorial length | Service destination |
| --- | --- | --- | --- |
| `/blog/youtube-audience-retention-editing-checklist` | YouTube audience retention editing checklist; turn observations into revision notes | About 1,052 words plus headings and takeaway | `/services/youtube-video-editing` |
| `/blog/video-podcast-editing-checklist` | Video podcast editing checklist; prepare recordings, review sync and conversation edits, agree deliverables | About 1,160 words plus headings and takeaway | `/services/podcast-video-editing` |

These topics extend the existing buying, briefing, Shorts, and EdiCut service
guides. Selection is based on relevant reader needs and service fit, not measured
keyword volume. No Search Console performance or ranking improvement was claimed.

Both introductions answer the query directly. Each guide contains concrete
review examples, practical checklists, four useful FAQs, an editorial byline,
and a 23 October publication date. Examples are illustrative; no invented client
results, statistics, universal retention benchmark, or growth guarantee is used.

Platform facts are attributed inline and in further reading to official sources:

- [YouTube: Measure key moments for audience retention](https://support.google.com/youtube/answer/9314415?hl=en)
- [YouTube: Create a podcast in YouTube Studio](https://support.google.com/youtube/answer/12751636?hl=en)

The retention guidance distinguishes replays from possible confusion and avoids
treating a graph as proof of cause. The podcast guide distinguishes full episodes
from promotional clips. The remaining workflow advice is original editorial copy.

## Discovery and page checks

- Six guides now appear in the index and its rendered ItemList. Topic counts and
  the sliding filters update to include the new articles.
- Both paths are registered for sitemap discovery, prerendering, and the
  production SEO validator. The shared path registry does not import article copy.
- Each title is 53 characters. Descriptions are 158 and 157 characters, respectively.
- Each rendered page has one H1, a self-canonical production URL, BlogPosting and
  BreadcrumbList JSON-LD, and a WebP social preview.
- FAQs remain visible content without unsupported FAQ rich-result markup.
- Production HTML is indexable and contains the article before JavaScript runs.
  Localhost correctly remains `noindex, nofollow, noarchive`.
- Retention has contextual inbound links from the existing service-selection and
  general brief guides; podcast has links from the brief and Shorts guides. Both
  are linked by the existing blog index and link to each other where useful.
- Service, pricing, contact, and existing guide links resolve to registered public
  paths. New related-card rows prioritize the same category and stop at three.

## Artwork, UI, and performance

- Two original native SVG covers, 1536 × 1024, with descriptive alternative text;
  no raster embedding, remote assets, or runtime font dependencies.
- Retention cover: 42,194 bytes raw / 15,931 gzip; WebP fallback 41,976 bytes.
- Podcast cover: 35,952 bytes raw / 11,951 gzip; WebP fallback 36,928 bytes.
- Existing generator and legacy compatibility alias retained. No new dependency.
- Fixed the article cover height cap that cropped artwork on larger screens.
  Intrinsic 3:2 dimensions now preserve the whole composition.
- Podcast contents sidebar links to the podcast service. Existing guides retain
  their YouTube service destination.
- Browser review: desktop 1280, tablet 768, phone 390; no document overflow.
  Covers loaded; full card titles and aligned row footers were visible. Contents
  links and FAQ disclosure work. No browser error messages were captured.
- No new video, tracker, account requirement, or database mutation was introduced.

## Changed files

- `apps/web/app/lib/blog.ts` — articles, metadata, contextual inbound links, podcast service destination.
- `apps/web/app/lib/public-pages.ts` — two discoverable paths.
- `apps/web/app/lib/blog.test.ts` — unique IDs, registered editorial links, canonical/social regression checks for all articles.
- `apps/web/app/components/site/BlogContents.tsx` — optional contextual service link.
- `apps/web/app/routes/blog-post.tsx` — relevant three-card related section and contextual sidebar.
- `apps/web/app/styles/blog.css` — preserve complete cover aspect ratio.
- `apps/web/scripts/validate-prerendered-seo.mjs` — require both new production pages.
- `scripts/create_blog_thumbnails.py` — repeatable vector artwork and social previews.
- `apps/web/public/images/blog/audience-retention-editing.{svg,webp}`
- `apps/web/public/images/blog/video-podcast-workflow.{svg,webp}`
- `docs/BLOG.md` — artwork and article publishing conventions.

## Commands and results

- `python scripts/create_blog_thumbnails.py` — six covers plus compatibility alias generated.
- `pnpm exec vitest run apps/web/app/lib/blog.test.ts apps/web/app/lib/seo.test.ts apps/web/workers/static-assets.test.ts` — 20 tests passed in three files.
- `pnpm --filter @edicut/web typecheck` — passed.
- `pnpm --filter @edicut/web build:cloudflare` — passed, production SEO validation passed for 27 public pages.
- Native SVG XML/external-resource audit — passed.
- Production HTML assertions for both new guides — passed: indexable, self-canonical, one H1, article schema, publication date.
- Rendered browser JSON-LD, filters, links, FAQs, images, and responsive audit — passed.

Evidence: `blog-expansion-{assets,browser,production}-2026-10-23.json`, build and
typecheck logs, and desktop/mobile screenshots in this directory. The working
tree already contained substantial unrelated changes; no reset, commit, remote
database change, or deployment was performed.

## Remaining follow-up

Deploy the web build to publish the new URLs, then confirm live responses and
sitemap discovery. Use Search Console after publication to track indexing,
queries, impressions, and clicks over subsequent weeks. Actual rankings and
Core Web Vitals require live data; this work does not establish either.
