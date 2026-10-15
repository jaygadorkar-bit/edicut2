# EdiCut logo animation preview

Standalone local preview: http://localhost:3002/logo-animation

The 2.4-second sequence uses the existing SVG outlines and brand colors. E, d, and i rise from below with 90ms staggered squash-and-stretch motion; the dot also rises and bounces. The red block expands, and C, u, and t rise with 80ms spacing. Each letter stretches upward, overshoots, squashes on arrival, and settles. The Cut letters retain their transparent cutouts.

The clapper makes a small anticipation lift, rotates clockwise approximately 8.7° from its original pose to close fully against the slate, holds closed from 1.64–1.74 seconds, then reopens to the original logo angle by 2.22 seconds. Its closing angle follows the original lower-edge geometry with slight overtravel to seal the rounded corner. The logo responds to the clap with a small settle.

Controls include replay, pause/resume, a keyboard-accessible scrubber, 0.5×/1×/1.5× playback, optional looping, and paper/checkerboard backgrounds. Reduced-motion users start with the finished logo and can explicitly replay; looping is disabled under that preference. Playback pauses when the document is hidden. The preview does not load workspace data or global site motion and is marked noindex.

## Changed files for this preview

- `apps/web/app/components/AnimatedLogo.tsx`: original vector paths split into animated parts and a transparent letter mask.
- `apps/web/app/lib/logo-animation.ts`: synchronized motion tracks and phase labels.
- `apps/web/app/routes/logo-animation.tsx`: standalone preview and playback controls.
- `apps/web/app/styles/logo-animation.css`: responsive canvas and accessible controls.
- `apps/web/app/routes.ts`: preview route registration.
- `apps/web/app/lib/root-data-requirements.ts` and its test: skip root/promo settings for the preview.
- `apps/web/app/lib/site-motion.ts` and its test: skip marketing motion wrappers for the preview.

Existing unrelated changes were preserved. No dependencies, data migrations, or deployments were added.

## Verification

- `pnpm --filter @edicut/web typecheck`: passed.
- `pnpm exec vitest run apps/web/app/lib/site-motion.test.ts apps/web/app/lib/root-data-requirements.test.ts`: 81 tests passed in 2 files.
- `pnpm --filter @edicut/web build`: client and server builds passed. Existing React Router future-flag warnings and empty resource chunks remain informational.
- Prettier check for the four new source files: passed.
- `git diff --check`: passed; Git reports existing LF/CRLF conversion warnings.
- Browser checks: replay, pause/resume, speed changes while playing, exact shared animation times, scrubber, keyboard Home/arrow keys, loop restart and cancellation, transparent Cut letters, reduced-motion initial state and manual replay.
- Responsive checks at the normal 1312×884 viewport, 390×844, and 320×568: no horizontal overflow; buttons are at least 44px high.
- No browser console errors or warnings were captured on the final page.

Screenshots: `artifacts/logo-animation-preview-2026-10-14.png` and `artifacts/logo-animation-mobile-2026-10-14.png`.

Motion revision checks: full clapper contact at 1.69 seconds, reopening to identity at 2.4 seconds, upward letter motion with stagger and arrival squash, synchronized replay/pause, mobile rendering, TypeScript and client/server builds. The revised closed pose is saved in `artifacts/logo-animation-closed-2026-10-14.png`.

The repository has no configured TypeScript ESLint rules; TypeScript, formatting, build, focused tests, and browser checks provided validation. Browser testing used Chromium in the in-app browser; Safari/Firefox and real mobile hardware remain unverified. This is a local preview only. Review the timing on the separate page before integrating the animation elsewhere.
