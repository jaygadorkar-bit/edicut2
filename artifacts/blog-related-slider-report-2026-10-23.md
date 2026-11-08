# Related guide slider

Replaced the related-article grid on standard blog articles with a horizontal
rail using the homepage portfolio's visual language: open cards, soft raised
SVG covers, full titles, and a partial next card to invite browsing. All five
other guides are available, with the same-category guide first.

## Changed files

- `apps/web/app/components/site/BlogRelatedSlider.tsx` — shared slider with snap
  scrolling, native touch browsing, mouse dragging, visible range, labelled
  previous/next controls, and keyboard Arrow/Home/End navigation.
- `apps/web/app/components/site/BlogRelatedSlider.test.tsx` — five interaction
  regressions for controls, edges, keyboard, reduced motion, dragging, touch
  delegation, and ordinary article activation.
- `apps/web/app/routes/blog-post.tsx` — replaces the grid and removes the
  three-guide limit. Article metadata and content are retained.
- `apps/web/app/styles/blog.css` — responsive track, neomorphic 48px controls,
  visible focus, sticky-header focus spacing, and reduced-motion support.
- `docs/BLOG.md` — records the shared slider behavior.

The index catalogue and the custom EdiCut story layout keep their existing
designs. Every card is rendered once with a normal article link; no duplicated
slide IDs, autoplay timers, dependency, or database changes were introduced.

## Validation

- `pnpm exec vitest run apps/web/app/components/site/BlogRelatedSlider.test.tsx apps/web/app/lib/blog.test.ts apps/web/app/lib/seo.test.ts apps/web/workers/static-assets.test.ts` — **25 tests passed**, four files.
- `pnpm --filter @edicut/web typecheck` — **passed**.
- `pnpm --filter @edicut/web build:cloudflare` — **passed**; SEO checks passed for
  all **27 public pages**.
- Built-HTML check — one carousel, five slides, labelled controls, one H1.
- Browser widths **1057, 768, 390px** — no document overflow; five unique slides,
  loaded SVGs, and 48 × 48px controls.
- Browser interactions — next button, Home/End, end-state disabling, desktop
  mouse drag without accidental navigation, and normal article navigation passed.
- Touch events delegate to browser scrolling; the automated regression confirms
  they do not capture the pointer. Reduced-motion navigation is covered by a test.
- Browser console error capture — empty.
- Desktop/mobile screenshots and measurements are stored beside this report.

Status: implemented locally and ready to deploy. No deployment was requested or
performed for this change. Existing unrelated working-tree changes were preserved.
