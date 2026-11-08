# Review playback controls — 15 October 2026

The local admin and client review pages render successfully. The Vite overlay was caused by the Docker web service using an old dependency installation after `mediabunny` was added. Restarting the service ran its existing manifest-change dependency synchronization and removed the error.

## Completed

- Redesigned the FPS and playback speed selectors with matching compact controls, accessible names, native keyboard selection, and a neutral visible focus indicator.
- Detect source FPS automatically from MP4 or WebM timing metadata. The currently open Drive clip reports 30 FPS in both review pages. Its choices are 23.976, 24, 25, 29.97, and 30 FPS.
- Prevent choosing frame-stepping rates above the detected source. Disable frame stepping while detection is pending or unavailable; ordinary playback remains available.
- Keep the metadata parser in a separate lazy-loaded chunk (53.77 kB gzip in the production build). Each probe requests at most twelve 256 KiB ranges, has a 12-second timeout, and cancels when leaving the video. Successful FPS results are cached in memory.
- Preserve the earlier compact composer, annotation, ruler, grid, comment menu, and toolbar work.

## Files changed for this task

- [ReviewPlayer.tsx](E:/development/Edicut/apps/web/app/components/ReviewPlayer.tsx): playback controls and source detection lifecycle.
- [ProjectReviewWorkspace.tsx](E:/development/Edicut/apps/web/app/components/ProjectReviewWorkspace.tsx): pass media size to the player.
- [review-proofing.css](E:/development/Edicut/apps/web/app/styles/review-proofing.css): selector styling and mobile layout.
- [review-frame-rate.ts](E:/development/Edicut/apps/web/app/lib/review-frame-rate.ts): capped options and fractional-rate formatting.
- [review-frame-rate.client.ts](E:/development/Edicut/apps/web/app/lib/review-frame-rate.client.ts): bounded byte-range metadata reader and parser.
- [review-frame-rate.test.ts](E:/development/Edicut/apps/web/app/lib/review-frame-rate.test.ts) and [ProjectReviewWorkspace.test.tsx](E:/development/Edicut/apps/web/app/components/ProjectReviewWorkspace.test.tsx): parser, limits, cancellation, and accessible controls coverage.
- [package.json](E:/development/Edicut/apps/web/package.json), [pnpm-lock.yaml](E:/development/Edicut/pnpm-lock.yaml), and [mediabunny.txt](E:/development/Edicut/apps/web/public/licenses/mediabunny.txt): pinned dependency and license/source notice. The lockfile also reflects the existing workspace manifest changes.

## Validation

All completed successfully:

```powershell
pnpm exec vitest run apps/web/app/lib/review-frame-rate.test.ts apps/web/app/lib/review-annotations.test.ts apps/web/app/components/ReviewCanvas.test.tsx apps/web/app/components/ProjectReviewWorkspace.test.tsx apps/web/app/lib/project-review-route.server.test.ts apps/web/app/lib/project-review-media.server.test.ts
pnpm --filter @edicut/web typecheck
pnpm --filter @edicut/web build
git diff --check -- apps/web/app/components/ReviewPlayer.tsx apps/web/app/components/ProjectReviewWorkspace.tsx apps/web/package.json pnpm-lock.yaml
docker compose restart web
docker compose ps --format json
```

The six focused test files contain 42 passing tests. Parser fixtures cover fractional MP4 timing, WebM, cached ranges, cross-block reads, large frame payloads with tail metadata, request limits, invalid responses, and cancellation. Type checking and the production client/server build passed. The Docker web service is healthy. The current ESLint configuration has no TypeScript rules/parser, so a TypeScript lint result is not claimed.

Browser checks covered both local review routes, selecting 24 FPS and restoring 30 FPS, keyboard focus, desktop appearance, and the client layout at 390 × 844 with no horizontal document overflow. The temporary viewport override was reset. No comments were submitted or production records changed.

![Desktop controls](E:/development/Edicut/artifacts/review-playback-controls-2026-10-15.jpg)

![Mobile controls](E:/development/Edicut/artifacts/review-playback-mobile-2026-10-15.jpg)

## Limits and follow-up

- Variable-frame-rate files use an estimated nominal cadence, identified in the control's tooltip. Timestamp-based stepping is not a guarantee of exact decoded-frame selection for every variable-rate file.
- Embedded YouTube sources and files whose timing metadata cannot be read within the probe budget have frame stepping disabled. Ordinary playback and speed selection continue to work.
- The build reports existing React Router future-flag warnings. These do not block the build.
- These changes are verified locally and built for production; they have not been deployed in this task. Include representative high-FPS and variable-rate uploads in the next release smoke test.
