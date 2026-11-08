# Shared custom dropdowns — 16 October 2026

## Delivered

- Replaced all 30 native dropdown UIs in the application with a shared custom control.
- Added rounded, viewport-aware menus with violet selection highlights, checkmarks, disabled states, scrolling, visible focus, and reduced-motion support.
- Preserved existing form names, values, required-field validation, controlled change handlers, reset behavior, and external form ownership through a hidden native form adapter. Native dropdowns are not exposed as visible controls.
- Added keyboard arrows, Home/End, typeahead, Enter/Space selection, Escape cancellation, Tab dismissal, and outside dismissal.
- Kept menus inside native dialogs/fullscreen when needed and outside ordinary clipping panels. Adjusted notification and compact video zoom styling.
- Existing searchable country and media playback menus already use custom UI and remain available.
- Added a source adoption test to catch new native select markup outside the shared adapter.

## Main files

- `apps/web/app/components/Select.tsx` — shared control and form adapter.
- `apps/web/app/styles/select.css` — shared trigger/menu styling; imported by `styles/global.css`.
- `apps/web/app/components/FormSelect.tsx` — existing project/notification API delegates to the shared control.
- Updated controls in `AdminUserDetails`, `ChatWorkspace`, `ClientIntakeFields`, `ReviewCanvas`, `admin/AdminClientsWorkspace`, `admin/AdminManagementPanel`, `admin/AffiliateAdminPanel`, `admin/MarketingPanel`, and `site/CustomQuoteForm`.
- Updated controls in `routes/admin-quotes.tsx`, `routes/admin.tsx`, and `routes/dashboard-placeholder.tsx`.
- Updated associated admin, client, chat, quote, notification, and video-review CSS selectors.
- Added `components/Select.test.tsx` and `components/select-adoption.test.ts`.

## Verification

| Command/check | Result |
| --- | --- |
| `pnpm test` | 125 test files passed, 2 skipped; 1,137 tests passed, 21 skipped |
| `pnpm --filter @edicut/web typecheck` | Passed |
| `pnpm --filter @edicut/web build` | Passed; existing empty-route-chunk and React Router future warnings |
| `git diff --check` on changed files | Passed; line-ending notices only |
| Source scan across apps/packages | Native select JSX appears only in the shared hidden adapter |
| Public quote form in browser | All 10 controls custom; zero visible native selects; pointer/keyboard selection worked |
| Mobile browser review | Menu stayed within viewport; no global horizontal overflow |
| Notifications dialog | Menu remained visible in the dialog; Escape closed the menu and kept the dialog open |

Keyboard behavior follows the [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/). Constraint-validation behavior was checked against the [HTML select API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLSelectElement/checkValidity) and automated interaction tests.

## Release state and limits

- Changes are local, **not deployed**. No dependencies or database schema changes were required.
- Browser review covered the public quote form and the existing manager session's notifications dialog. Admin-only pages were covered by source review and tests; the current browser session did not provide admin access.
- Existing unrelated changes were preserved. No manager/editor assignments, quote requests, role changes, or notification read actions were submitted during browser review.
- A development navigation AbortError was recorded while hot reload/navigation overlapped. A fresh workspace reload completed with no new browser errors; no dropdown rendering exception was observed.
- Recommended follow-up: review the Clients manager/editor dropdowns in an admin session, then deploy when ready.

## Screenshots

- `artifacts/custom-dropdown-desktop-2026-10-16.jpg`
- `artifacts/custom-dropdown-mobile-2026-10-16.jpg`
- `artifacts/custom-dropdown-dialog-2026-10-16.jpg`
