# EdiCut blog SEO implementation audit

Date: 2026-10-22  
Scope: `/blog` and three article routes, metadata/schema helpers, crawl discovery, article accuracy, and image metadata.

## Keyword map

| Page | Primary topic | Search intent | Supporting internal links |
|---|---|---|---|
| `/blog` | YouTube video editing guides | Browse practical guidance | Links to all three articles |
| `/blog/how-to-choose-youtube-video-editing-service` | how to choose a YouTube video editing service | Compare providers and scope | YouTube editing service, pricing, portfolio/reference examples, brief checklist, Shorts guide, contact |
| `/blog/youtube-video-editing-brief-checklist` | YouTube video editing brief checklist | Prepare a brief and sample handoff | YouTube editing service, Shorts guide, provider comparison |
| `/blog/repurpose-youtube-videos-into-shorts` | repurpose YouTube videos into Shorts | Select and adapt a complete source idea | Short-form editing service, brief checklist, provider comparison, pricing, contact |

The three articles have separate intents and cross-link as a small topic cluster. The service selection article now describes EdiCut's public gallery accurately: it presents credited reference examples, which can start a style discussion but do not establish that EdiCut produced the work. It advises asking the team for relevant EdiCut-produced work. No client results, individual authors, or credentials are claimed.

## Technical implementation

- Added route-aware helpers for index/article title, description, canonical URL, robots policy, Open Graph/Twitter image data, publication time, and structured data.
- Structured data covers `Blog`, `ItemList`, `BlogPosting`, and `BreadcrumbList`. The editorial author is the EdiCut editorial team and references the visible `/blog#editorial-team` note. No rating or review schema is emitted.
- Added the index and three article URLs to `PUBLIC_PAGE_PATHS`; this registry feeds indexability, sitemap generation, prerendering, and the Worker public HTML allowlist.
- Added those same required paths to the production prerender SEO validator.
- Article covers use meaningful descriptions of the actual illustrations, WebP URLs, 1536 × 1024 dimensions, Twitter image alt text, responsive image sources, and intrinsic dimensions.
- Publisher details are included directly in blog schema, with the same organization identity, contact details, and logo as the site's existing schema. Articles link back to the Blog entity and its visible editorial team.
- Unknown article slugs return HTTP 404. The fallback metadata is noindex, avoiding an indexable soft 404.
- Blog links are in the site footer only; the header navigation was left unchanged.

## Findings and fixes

| Priority | Finding | Resolution |
|---|---|---|
| High | EdiCut's portfolio contains credited reference examples, not represented client work. An early draft could imply that the portfolio demonstrated EdiCut's own craft. | Updated the article text and FAQ to label the examples correctly and direct readers to ask for relevant EdiCut-produced work. |
| Medium | Initial image alt text described people/storyboards that were not in the illustrations. | Rewrote alt text to describe the filmstrip/checkmark, storyboard/pencil, and landscape-to-vertical crop artwork actually shown. |
| Medium | New blog routes needed consistent sitemap, prerender, and indexability inclusion. | Added all four routes to the shared public path registry and production validation list. |
| Medium | Long breadcrumb text wrapped its separators on mobile. | Kept breadcrumb items aligned and truncated only the current article label. |
| Low | Article card headings were at the same level as their parent section heading. | Featured article uses H2; cards within guide sections use H3. |
| Low | Search snippets needed clear brand attribution and consistent length. | Final article titles are 52–55 characters; descriptions are 151–152 characters and mention EdiCut naturally. |

## Checks and limits

- Source review confirmed one H1 per route, article breadcrumb navigation, a visible byline/date/read time, linked table of contents, FAQ content, related articles, and a not-found boundary.
- Confirmed the production path registry drives sitemap, prerender, indexability, and Worker page routing. Confirmed generic public image routing covers the WebP assets.
- Completed rendered DOM inspection in the Codex in-app browser, including canonical URLs, one H1 per page, parseable JSON-LD, bylines, artwork loading, table-of-contents destinations, FAQ expansion, and the footer link. Confirmed Blog is absent from the header, including the existing mobile navigation configuration.
- Verified index and article layouts at narrow mobile widths (320/390), tablet (768), and desktop (1258), with no horizontal overflow. Browser emulation was reset after inspection. A historical Vite HMR message caused by registering a new route did not recur after a full reload; the fresh console check reported no errors.
- Local HTTP checks: all four published routes return 200; an unknown article returns 404 and noindex. Local pages correctly use noindex while pointing to their eventual production canonical URLs.
- Production build completed using `pnpm --filter @edicut/web build:cloudflare`. Its SEO validator passed for all 24 public pages, including the four new blog pages. Production HTML has canonical `https://edicut.com` article URLs, one H1, unique snippets, and `index, follow`.
- `pnpm typecheck` passed across the project; the final web typecheck passed after SEO refinements. The focused SEO, service-content, Worker asset, and security-header suites passed: 41 tests across four files. No unrelated tests were added.
- All 15 contextual internal article links resolve to generated public pages. Visible article prose is approximately 1,025 / 1,022 / 1,073 words, with a five-minute reading estimate for each.
- Generated artwork uses the built-in image generator. Full WebP files are 39.8 / 70.1 / 46.5 KB; responsive 768px variants are 15.7 / 25.6 / 17.8 KB. Offscreen related-card images intentionally lazy-load.
- Evidence: `blog-http-seo-checks-2026-10-22.json`, `blog-content-checks-2026-10-22.json`, `blog-browser-checks-2026-10-22.json`, desktop/mobile screenshots in `artifacts/`, and `blog-artwork/prompts.md` with generation prompts and saved asset paths.
- New source files: `app/lib/blog.ts`, `app/lib/blog-seo.ts`, `app/routes/blog.tsx`, `app/routes/blog-post.tsx`, `app/components/site/Blog.tsx`, and `app/styles/blog.css` under `apps/web/`. Updated the footer in `Marketing.tsx`, route registrations, public path registry, and prerender SEO validator.
- No production deployment was performed. The remaining release step is to publish this reviewed build and inspect the four URLs in Search Console. Ranking changes and field Core Web Vitals can only be measured after publication and traffic; no ranking or traffic guarantee is implied.
