# Homepage service section — 22 October 2026

The five SEO service links now live in a dedicated section immediately after the portfolio. The section follows EdiCut’s existing DM Sans typography, blue-gray surfaces, inset icon treatment, and restrained red interaction color. It uses a split layout on desktop and stacked, full-width service rows on mobile. The creator section now focuses on its audience without the old link strip.

## Changed files

- `apps/web/app/routes/home.tsx`: mount the new section after Portfolio, load its stylesheet, and remove the old service navigation from the creator section.
- `apps/web/app/components/site/HomeServicesSection.tsx`: accessible service directory using the existing published service data, five descriptive links, and a link to the service index.
- `apps/web/app/styles/home-services.css`: responsive layout, spacing, keyboard focus, and reduced-motion treatment.

## Verification

- `docker exec edicut-web pnpm --filter @edicut/web typecheck` — passed.
- `docker exec edicut-web pnpm --filter @edicut/web build` — passed, including static prerendering.
- `docker exec edicut-web pnpm exec vitest run apps/web/app/lib/services.test.ts apps/web/app/lib/seo.test.ts` — 13 tests passed.
- `git diff --check` scoped to the three changed files — passed.
- Inspected the generated homepage HTML: all five service links are present, the section immediately follows `#portfolio`, the old creator navigation is absent, and the homepage retains one H1.
- Used the visible Codex browser at 320×740, 375×812, 768×1024, 844×390, and the default 1258×884 viewport. The section had no horizontal overflow and every link met the 44px minimum touch target.
- Verified visible keyboard focus, reduced-motion behavior, independent row hover feedback, and navigation to the YouTube service page and the service directory.
- Restored the browser’s normal viewport and media preferences; the homepage preview remains open at the new section.

## Limits and follow-up

This is a local change; no deployment or production data changes were performed. The production build still emits warnings from the current source map configuration and empty resource-route chunks. A transient React Router stylesheet cleanup error appeared after hot edits; it did not reproduce after a clean reload, and subsequent service navigation passed. Unrelated existing workspace changes were preserved.

Review the local preview before publishing with the normal deployment workflow.

## Screenshots

- [Desktop](./home-services-desktop-2026-10-22.png)
- [Mobile introduction](./home-services-mobile-top-2026-10-22.png)
- [Mobile service directory](./home-services-mobile-2026-10-22.png)
