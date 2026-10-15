# Workspace notifications — 14 October 2026

The workspace bell now opens a shared notification panel instead of linking to the video review queue. The admin overview includes a New events section with unread totals, event-type shortcuts, and six recent events.

## Behavior

- Alerts cover new editing requests, orders/package selections, confirmed payments, enquiries, custom quote requests, video versions, feedback/replies, approvals, and revision requests.
- Administrators receive operational events. Clients receive their own project and billing events. Editors/managers receive review events only for assigned projects. Support accounts receive enquiry events only when their current feature access permits the inbox.
- Event links open the exact project/version, order, purchase, enquiry, or quote. Selected-record views retain a link back to the complete list; customer purchase queries retain owner scoping.
- The panel supports unread/all views, a custom keyboard-accessible event-type dropdown, individual read/unread, mark all read, manual refresh, and automatic refresh every 30 seconds while visible and online.
- Read status is scoped separately to each account and admin/client identity, saved in this browser, and synchronized between its tabs. Only opaque event keys and read times are stored locally, not message bodies or credentials. Clearing browser storage resets this state; it does not synchronize across devices.
- The feed shows at most the latest 100 events from the last 90 days. Counts refer to unread events in that feed, not outstanding workflow totals. Reading a notification does not mark an order paid, resolve feedback, or update an enquiry's server status.
- Event sources are derived from existing saved records, not an immutable audit log. Removed records disappear and current status changes affect the corresponding event presentation.
- Optional missing tables do not suppress other sources. Affected event-type totals show a dash and an explanation rather than a false zero. Other connection failures show a retryable error and keep any previously loaded feed.

## Changed files

New:

- `apps/web/app/components/WorkspaceNotifications.tsx`: shared provider, bell, native accessible dialog, event list, admin recent-events section.
- `apps/web/app/lib/notifications.ts`: event types, bounded read-state handling, time formatting.
- `apps/web/app/lib/notifications.server.ts`: permission-scoped source queries and internal links.
- `apps/web/app/routes/api-notifications.ts`: authenticated resource endpoint, rate limits, private no-store responses, safe error handling.
- `apps/web/app/styles/notifications.css`: desktop panel, mobile sheet, event and counter styles.
- `notifications.test.ts`, `notifications.integration.test.ts`, `api-notifications.server.test.ts`: state, permissions, source completeness, and authentication regressions.

Integration changes:

- `apps/web/app/components/WorkspaceShell.tsx`: installs the shared provider/bell across workspace panels, including panels without video-review permission.
- `apps/web/app/routes/admin.tsx`: New events section above admin shortcuts.
- `apps/web/app/routes.ts`: notification endpoint registration.
- `apps/web/app/lib/customer-subscriptions.server.ts`, `routes/admin-subscriptions.tsx`, `routes/dashboard-subscriptions.tsx`: selected-record queries and views; client ownership retained.
- `apps/web/app/routes/dashboard-messages.tsx`, `components/EnquiriesInbox.tsx`, `routes/admin-quotes.tsx`: selected enquiry/quote views and links back to all records.
- `apps/web/app/lib/material-symbols.ts` and its test: required notification icons.
- `routes/subscriptions.server.test.ts`, `routes/dashboard-subscriptions.server.test.ts`: selected-record pagination and authenticated-owner coverage.

The previously removed Reviews/Uploads navigation entries are also absent from the subscription page. Unrelated existing workspace changes were preserved.

## Verification

| Check | Result |
| --- | --- |
| `pnpm exec vitest run` with the dedicated local `REVIEW_TEST_DATABASE_URL` | 101 files / 942 tests passed |
| `pnpm exec vitest run apps/web/app/routes/api-notifications.server.test.ts` after the final refresh fix | 7 tests passed, including the additional refresh regression |
| `pnpm --filter @edicut/web typecheck` | Passed after final changes |
| `pnpm --filter @edicut/web build` | Client and SSR builds passed; existing React Router future-flag notices remain |
| `git diff --check` scoped to changed tracked files | Passed |
| TypeScript ESLint | Repository ESLint configuration does not cover TS/TSX; type checking and production compilation were used |

The local PostgreSQL tests execute actual source queries against a dedicated schema in a disposable database. They verify all event categories, customer isolation, editor assignment, removed feature access, support scope, deterministic history limits, and missing optional sources. The disposable container was stopped after testing.

The endpoint checks current authenticated identity and current role-feature settings before source reads. Submitted role/owner IDs cannot expand access. Responses do not expose database diagnostics, credentials, enquiry bodies, or internal quote notes. Background reads are bounded and avoid overlapping requests. Successful same-endpoint session refresh redirects preserve the refreshed cookie and private no-store headers; actual sign-in redirects become a safe 401 JSON response. This respects the existing authentication flow and the cookie/cache guidance in [Supabase's SSR advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

Live browser verification covered:

- Admin feed with existing editing requests, orders, payment confirmations and enquiries, plus the New events section.
- Individual read status updating both bell and dashboard, surviving reload, and returning to unread.
- Client feed containing only the signed-in client's project/purchase events and appropriate filter options.
- A client payment notification opening exactly the selected purchase, with the bell count persisting across panels.
- Mark all read, read/unread restoration, keyboard dropdown selection, Escape dismissal and focus return.
- 390px and 320px layouts without horizontal overflow, with internal list scrolling and reachable controls.

Browser read-state checks were restored to their original unread state. No client records, orders, enquiries, or media were created or modified for verification.

## Screenshots

- [Admin New events section](../artifacts/admin-new-events-2026-10-14.png)
- [Desktop notifications](../artifacts/notifications-desktop-2026-10-14.png)
- [Mobile notifications](../artifacts/notifications-mobile-2026-10-14.png)

## Remaining activation and follow-up

No new database migration is needed for the core notification feed, and no remote migration or cloud deployment was performed. Video-version/feedback notifications depend on the previously prepared project-review migration 0017. Until that setup is authorized and applied, those optional sources show as unavailable while request/order/payment/enquiry/quote notifications continue to work.

The existing pending 0016/0017 migrations and live private-video provider validation remain documented in `docs/video-review-workspace-2026-10-14.md`. If read state must synchronize across devices, a durable server-side receipt store is the next separate enhancement.
