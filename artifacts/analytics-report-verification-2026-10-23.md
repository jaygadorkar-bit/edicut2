# Daily, weekly, and monthly analytics reports

Implemented locally on 23 October 2026. No production deployment or database writes/migrations were performed for this feature.

## Behavior

- Daily shows today in UTC. Weekly includes today and the previous six UTC dates. Monthly includes today and the previous 29 UTC dates.
- Shared controls above the dashboard and in **Where people interact** update consented human-session estimates, acquisition/lead signals, and interaction-area totals.
- Every report shows its exact UTC date range. URL selection survives refresh and browser history.
- SQL reads use the same parameterized, start-inclusive/end-exclusive range. Existing indexes and row caps remain in use; no per-visitor identifiers were added.
- Range and on-site totals are committed together. Pending controls prevent duplicate requests while retaining keyboard focus.
- Hidden chart tables now sit inside clipped wrappers, fixing mobile page overflow while preserving accessible chart data. Wide chart/table panels can be scrolled using the keyboard.
- Cloudflare provider reports retain their separately labeled fixed windows and existing country-period selector.

## Changed files

- `apps/web/app/routes/admin-analytics.tsx`: range selection, matching loader queries, loading feedback, refresh coordination.
- `apps/web/app/routes/admin-analytics.server.test.ts`: new loader authorization, period propagation, fallback, and atomic loading tests.
- `apps/web/app/lib/site-analytics-report.ts`: new allowlisted periods, UTC boundaries, date formatting, and zero-fill date list.
- `apps/web/app/lib/site-analytics-report.test.ts`: new invalid-input, UTC, leap-day, DST, and year-boundary tests.
- `apps/web/app/lib/site-analytics.server.ts`: bounded date predicates for all on-site reads and selected-window session series.
- `apps/web/app/lib/site-analytics.server.test.ts`: query-bound and zero-fill regressions.
- `apps/web/app/components/admin/AnalyticsReportPeriodControl.tsx`: new reusable neomorphic period controls.
- `apps/web/app/components/admin/AnalyticsReportPeriodControl.test.tsx`: new selection, pending, repeat-request, and focus tests.
- `apps/web/app/components/admin/AnalyticsDashboard.tsx`: period-specific labels/totals, interaction controls, empty states, accessible overflow fix.
- `apps/web/app/components/admin/AnalyticsDashboard.test.tsx`: consistent range labels, provider independence, session totals, accessible chart markup.
- `docs/ANALYTICS_REPORTS.md`: report semantics and maintenance notes.

Unrelated existing workspace changes were preserved.

## Commands and results

1. `pnpm exec vitest run apps/web/app/lib/site-analytics-report.test.ts apps/web/app/lib/site-analytics.server.test.ts apps/web/app/components/admin/AnalyticsDashboard.test.tsx apps/web/app/components/admin/AnalyticsReportPeriodControl.test.tsx apps/web/app/routes/admin-analytics.server.test.ts apps/web/app/routes/admin-audit.server.test.ts apps/web/app/routes/api-site-analytics.test.ts`
   - **101 tests passed across 7 files.** See `analytics-report-tests-2026-10-23.log`.
2. `pnpm --filter @edicut/web typecheck`
   - **Passed.** Includes shared/database TypeScript builds, route type generation, and web TypeScript checking. See `analytics-report-typecheck-2026-10-23.log`.
3. `pnpm --filter @edicut/web run build:cloudflare`
   - **Passed**, including SEO prerender validation for 27 public pages. See `analytics-report-build-2026-10-23.log`.
4. Targeted `pnpm exec eslint` over the ten changed TypeScript/TSX files.
   - The repository ESLint configuration only defines global ignores. All ten files were reported as having no matching configuration, so this is **not a successful lint validation**. No unrelated lint/configuration changes were made. See `analytics-report-lint-2026-10-23.log`.
5. `git diff --check` over applicable tracked files completed without errors. Most analytics files already existed as untracked work in the supplied workspace; their contents were inspected directly.

## Browser validation

- Tested desktop at 1057×884 and a clean default desktop viewport; tested mobile at 390×844.
- Daily, weekly, and monthly session series contain 1, 7, and 30 dates respectively.
- Daily acquisition page views were **21**, while weekly/monthly page views were **79** at the time of validation. This confirms that selection changes the queried window rather than just changing labels.
- Both on-site selectors remain synchronized. The separate country selector retains its own selection.
- Verified keyboard Enter activation, retained focus on the chosen button, reload persistence, and browser back navigation.
- Mobile document width equals its content width (380px usable viewport), with local scrolling for wide report tables and charts. Period buttons are 44px high.
- A clean final browser tab recorded **no console warnings or errors**. An earlier development tab captured a deferred-provider timeout and a hot-reload effect-dependency warning during editing; neither reproduced in the final clean tab.
- Only read-only reports were queried. No customer records or tracking events were created/deleted as part of validation.

Evidence: `analytics-report-browser-2026-10-23.json`, `analytics-weekly-desktop-2026-10-23.png`, and `analytics-weekly-mobile-2026-10-23.png`.

## Limits and follow-up

- Monthly is a rolling 30-date window, rather than a calendar month. The UI explains this explicitly.
- Session counts remain consent-based browser-tab estimates; they cannot verify unique human visitors.
- Provider availability and collection consent still determine which data exists. Existing Cloudflare sampling and aggregation limits apply.
- Ready for deployment when requested. Recommended maintenance follow-up: configure TypeScript/TSX linting at the repository level.
